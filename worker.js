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
    return String(value.CurrentTextValue ?? value.currentTextValue ?? value.CurrentValue ?? value.currentValue ?? '').trim();
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

function buildRegistration(body, env) {
  const plateType = body?.plateType === 'rs' ? 'rs' : 'normal';

  if (plateType === 'rs') {
    const digits = String(body?.rsNumber ?? '').replace(/\D/g, '');
    if (!/^\d{1,7}$/.test(digits)) throw new Error('INVALID_PLATE');
    const format = env.RS_PLATE_FORMAT === 'suffix' ? 'suffix' : 'prefix';
    return {
      displayPlate: `${digits} ن.ت`,
      apiPlate: format === 'suffix' ? `${digits}RS` : `RS${digits}`,
      plateType
    };
  }

  const series = String(body?.series ?? '').replace(/\D/g, '');
  const number = String(body?.number ?? '').replace(/\D/g, '');
  if (!/^\d{1,3}$/.test(series) || !/^\d{1,4}$/.test(number)) throw new Error('INVALID_PLATE');

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

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-robots-tag': 'noindex'
    }
  });
}

async function lookup(request, env) {
  if (request.method !== 'POST') return json({ ok: false, error: 'METHOD_NOT_ALLOWED' }, 405);

  const username = env.REGCHECK_USERNAME;
  if (!username) return json({ ok: false, error: 'API_NOT_CONFIGURED' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let plate;
  try {
    plate = buildRegistration(body, env);
  } catch {
    return json({ ok: false, error: 'INVALID_PLATE' }, 400);
  }

  const endpoint = new URL('https://www.regcheck.org.uk/api/reg.asmx/CheckTunisia');
  endpoint.searchParams.set('RegistrationNumber', plate.apiPlate);
  endpoint.searchParams.set('username', username);

  try {
    const response = await fetch(endpoint.toString(), {
      headers: {
        accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
        'user-agent': 'Matrik-Tunisia/3.0'
      }
    });

    const xml = await response.text();
    if (!response.ok) return json({ ok: false, error: 'UPSTREAM_ERROR' }, 502);

    const providerError = classifyProviderError(xml);
    if (providerError) return json({ ok: false, error: providerError }, providerError === 'NO_CREDITS' ? 402 : 502);

    let vehicle = null;
    const jsonMatch = xml.match(/<vehicleJson(?:\s[^>]*)?>([\s\S]*?)<\/vehicleJson>/i);

    if (jsonMatch) {
      try {
        const raw = JSON.parse(xmlDecode(jsonMatch[1]));
        const rawError = pick(raw?.Error) || pick(raw?.error) || pick(raw?.Message);
        if (!rawError) vehicle = normalizeVehicle(raw || {});
      } catch {}
    }

    if (!vehicle || (!vehicle.make && !vehicle.model && !vehicle.description)) {
      const vehicleData = xml.match(/<vehicleData(?:\s[^>]*)?>([\s\S]*?)<\/vehicleData>/i);
      if (vehicleData) vehicle = vehicleFromXml(vehicleData[1]);
    }

    if (!vehicle || (!vehicle.make && !vehicle.model && !vehicle.description)) {
      return json({ ok: false, error: 'VEHICLE_NOT_FOUND', plate: plate.displayPlate }, 404);
    }

    if (vehicle.imageUrl?.startsWith('http://')) vehicle.imageUrl = 'https://' + vehicle.imageUrl.slice(7);

    return json({
      ok: true,
      plate: plate.displayPlate,
      plateType: plate.plateType,
      vehicle,
      source: 'RegCheck · Tunisie',
      historyAvailable: false
    });
  } catch {
    return json({ ok: false, error: 'LOOKUP_FAILED' }, 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/lookup') {
      return lookup(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};
