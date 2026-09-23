function xmlDecode(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function pick(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (typeof value === 'object') {
    return String(
      value.CurrentTextValue ?? value.currentTextValue ?? value.CurrentValue ?? value.currentValue ?? ''
    ).trim();
  }
  return '';
}

function normalizeVehicle(raw) {
  return {
    description: pick(raw.Description),
    make: pick(raw.CarMake) || pick(raw.MakeDescription),
    model: pick(raw.CarModel) || pick(raw.ModelDescription),
    year: pick(raw.RegistrationYear) || pick(raw.ManufactureYearFrom) || pick(raw.ManufacturingYear),
    registrationDate: pick(raw.RegistrationDate),
    fuel: pick(raw.FuelType),
    variant: pick(raw.Variant),
    engine: pick(raw.Engine) || pick(raw.EngineSize),
    type: pick(raw.Type) || pick(raw.BodyStyle),
    fiscalPower: pick(raw.FiscalPower),
    transmission: pick(raw.Transmission),
    imageUrl: pick(raw.ImageUrl)
  };
}

function getTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? xmlDecode(match[1]).replace(/<[^>]+>/g, '').trim() : '';
}

function getCurrentTextValue(xml, parentTag) {
  const parent = xml.match(new RegExp(`<${parentTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${parentTag}>`, 'i'));
  return parent ? getTag(parent[1], 'CurrentTextValue') : '';
}

function vehicleFromXml(xml) {
  return {
    description: getTag(xml, 'Description'),
    make: getCurrentTextValue(xml, 'CarMake') || getCurrentTextValue(xml, 'MakeDescription'),
    model: getCurrentTextValue(xml, 'CarModel') || getCurrentTextValue(xml, 'ModelDescription'),
    year: getTag(xml, 'RegistrationYear'),
    registrationDate: getTag(xml, 'RegistrationDate'),
    fuel: getCurrentTextValue(xml, 'FuelType') || getTag(xml, 'FuelType'),
    variant: getCurrentTextValue(xml, 'Variant') || getTag(xml, 'Variant'),
    engine: getCurrentTextValue(xml, 'Engine') || getTag(xml, 'Engine') || getCurrentTextValue(xml, 'EngineSize'),
    type: getCurrentTextValue(xml, 'Type') || getTag(xml, 'Type'),
    fiscalPower: getCurrentTextValue(xml, 'FiscalPower') || getTag(xml, 'FiscalPower'),
    transmission: getCurrentTextValue(xml, 'Transmission') || getTag(xml, 'Transmission'),
    imageUrl: getTag(xml, 'ImageUrl')
  };
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

function buildRegistration(body) {
  const plateType = body?.plateType === 'rs' ? 'rs' : 'normal';

  if (plateType === 'rs') {
    const digits = String(body?.rsNumber ?? '').replace(/\D/g, '');
    if (!/^\d{1,7}$/.test(digits)) throw new Error('INVALID_PLATE');

    // RegCheck documentation confirms RS is the Latin representation of ن ت.
    // Prefix is the default. Set RS_PLATE_FORMAT=suffix if RegCheck support tells you otherwise.
    const format = process.env.RS_PLATE_FORMAT === 'suffix' ? 'suffix' : 'prefix';
    return {
      displayPlate: `${digits} ن.ت`,
      apiPlate: format === 'suffix' ? `${digits}RS` : `RS${digits}`,
      plateType
    };
  }

  const series = String(body?.series ?? '').replace(/\D/g, '');
  const number = String(body?.number ?? '').replace(/\D/g, '');
  if (!/^\d{1,3}$/.test(series) || !/^\d{1,4}$/.test(number)) throw new Error('INVALID_PLATE');

  // RegCheck sample: 818TU223 is displayed in Tunisia as 223 تونس 818.
  return {
    displayPlate: `${series} تونس ${number}`,
    apiPlate: `${number}TU${series}`,
    plateType
  };
}

function classifyProviderError(xml) {
  const text = xmlDecode(xml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  if (/credit|balance|quota|subscription|payment/.test(text) && /low|zero|insufficient|expired|no |not /.test(text)) return 'NO_CREDITS';
  if (/username|authori[sz]|authentication|login/.test(text) && /invalid|wrong|failed|not /.test(text)) return 'AUTH_ERROR';
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  // Keep this server-side. Never put it in index.html/client JavaScript.
  const username = process.env.REGCHECK_USERNAME || process.env.VEHICULE_API_USERNAME;
  if (!username) {
    return res.status(503).json({ ok: false, error: 'API_NOT_CONFIGURED' });
  }

  let plate;
  try {
    plate = buildRegistration(parseBody(req));
  } catch {
    return res.status(400).json({ ok: false, error: 'INVALID_PLATE' });
  }

  const endpoint = new URL('https://www.regcheck.org.uk/api/reg.asmx/CheckTunisia');
  endpoint.searchParams.set('RegistrationNumber', plate.apiPlate);
  endpoint.searchParams.set('username', username);

  try {
    const response = await fetch(endpoint, {
      headers: {
        'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8',
        'User-Agent': 'Matrik-Tunisia/2.0'
      },
      signal: AbortSignal.timeout(15000)
    });

    const xml = await response.text();

    if (!response.ok) {
      return res.status(502).json({ ok: false, error: 'UPSTREAM_ERROR' });
    }

    const providerError = classifyProviderError(xml);
    if (providerError) {
      return res.status(providerError === 'AUTH_ERROR' ? 502 : 402).json({ ok: false, error: providerError });
    }

    let vehicle = null;
    const jsonMatch = xml.match(/<vehicleJson(?:\s[^>]*)?>([\s\S]*?)<\/vehicleJson>/i);

    if (jsonMatch) {
      try {
        const raw = JSON.parse(xmlDecode(jsonMatch[1]));
        const rawError = pick(raw?.Error) || pick(raw?.error) || pick(raw?.Message);
        if (!rawError) vehicle = normalizeVehicle(raw || {});
      } catch {
        // Fall back to vehicleData XML below.
      }
    }

    if (!vehicle || (!vehicle.make && !vehicle.model && !vehicle.description)) {
      const vehicleData = xml.match(/<vehicleData(?:\s[^>]*)?>([\s\S]*?)<\/vehicleData>/i);
      if (vehicleData) vehicle = vehicleFromXml(vehicleData[1]);
    }

    if (!vehicle || (!vehicle.make && !vehicle.model && !vehicle.description)) {
      return res.status(404).json({ ok: false, error: 'VEHICLE_NOT_FOUND', plate: plate.displayPlate });
    }

    // Make provider image HTTPS when possible to avoid mixed-content blocking.
    if (vehicle.imageUrl?.startsWith('http://')) {
      vehicle.imageUrl = 'https://' + vehicle.imageUrl.slice(7);
    }

    return res.status(200).json({
      ok: true,
      plate: plate.displayPlate,
      plateType: plate.plateType,
      vehicle,
      source: 'RegCheck · Tunisie',
      historyAvailable: false
    });
  } catch (error) {
    const code = error?.name === 'TimeoutError' || error?.name === 'AbortError'
      ? 'UPSTREAM_TIMEOUT'
      : 'LOOKUP_FAILED';
    return res.status(502).json({ ok: false, error: code });
  }
}
