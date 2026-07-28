const russianPhoneDigits = /^7\d{10}$/;

export function normalizeRussianPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (!digits.startsWith("7")) digits = `7${digits}`;
  return digits.slice(0, 11);
}

export function isRussianPhone(value: string) {
  return value === "" || russianPhoneDigits.test(value);
}

export function formatRussianPhone(value: string) {
  const digits = normalizeRussianPhone(value);
  if (!digits) return "";

  const number = digits.slice(1);
  let formatted = "+7";
  if (number.length > 0) formatted += ` (${number.slice(0, 3)}`;
  if (number.length >= 3) formatted += ")";
  if (number.length > 3) formatted += ` ${number.slice(3, 6)}`;
  if (number.length > 6) formatted += `-${number.slice(6, 8)}`;
  if (number.length > 8) formatted += `-${number.slice(8, 10)}`;
  return formatted;
}
