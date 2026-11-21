const bluetooth_pattern =
  /bluetooth|hands-?free|airpods|buds|headset|headphones|earphones|rockerz|boat|jbl|bose|sony|wh-|wf-|oneplus|realme|noise|skullcandy|sennheiser|jabra/i;

const mic_key = 'beside:mic';
const speaker_key = 'beside:speaker';

type Device = { deviceId: string; label: string };

function real_devices<T extends Device>(devices: T[]): T[] {
  return devices.filter((device) => device.deviceId !== 'default' && device.deviceId !== 'communications');
}

function pick<T extends Device>(devices: T[], saved_id: string | null): T | null {
  const real = real_devices(devices);
  const saved = saved_id ? real.find((device) => device.deviceId === saved_id) : undefined;
  if (saved) return saved;
  return real.find((device) => bluetooth_pattern.test(device.label)) ?? null;
}

function read_saved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function remember_mic(device_id: string) {
  try {
    localStorage.setItem(mic_key, device_id);
  } catch {}
}

export function preferred_mic<T extends Device>(devices: T[]): T | null {
  return pick(devices, read_saved(mic_key));
}

export function preferred_speaker<T extends Device>(devices: T[]): T | null {
  return pick(devices, read_saved(speaker_key));
}

export function is_bluetooth(label: string) {
  return bluetooth_pattern.test(label);
}
