export const VOICE_CATALOG = [
  { countryCode: 'IN', countryName: 'India', locality: 'National', e164: '918000012345', monthlyFeeUsd: 8 },
  { countryCode: 'IN', countryName: 'India', locality: 'Mumbai', e164: '912240010101', monthlyFeeUsd: 8 },
  { countryCode: 'IN', countryName: 'India', locality: 'Bengaluru', e164: '918040020202', monthlyFeeUsd: 8 },
  { countryCode: 'IN', countryName: 'India', locality: 'Delhi', e164: '911140030303', monthlyFeeUsd: 8 },
  { countryCode: 'US', countryName: 'United States', locality: 'National', e164: '18550142291', monthlyFeeUsd: 12 },
  { countryCode: 'US', countryName: 'United States', locality: 'New York', e164: '12125550101', monthlyFeeUsd: 12 },
  { countryCode: 'GB', countryName: 'United Kingdom', locality: 'London', e164: '442071946000', monthlyFeeUsd: 10 },
  { countryCode: 'GB', countryName: 'United Kingdom', locality: 'National', e164: '448000551010', monthlyFeeUsd: 10 },
  { countryCode: 'AE', countryName: 'United Arab Emirates', locality: 'Dubai', e164: '97140010101', monthlyFeeUsd: 14 },
  { countryCode: 'SG', countryName: 'Singapore', locality: 'National', e164: '6569101101', monthlyFeeUsd: 12 },
] as const;

export function formatVirtualNumber(e164: string): string {
  const digits = e164.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.startsWith('1') && digits.length === 11) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.startsWith('44')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  }
  return `+${digits}`;
}

export function monthlyPrice(countryCode: string, monthlyFeeUsd: number): {
  currency: 'INR' | 'USD';
  amount: number;
  display: string;
} {
  if (countryCode.toUpperCase() === 'IN') {
    const amount = Math.round(monthlyFeeUsd * 83);
    return { currency: 'INR', amount, display: `₹${amount} / month` };
  }
  return { currency: 'USD', amount: monthlyFeeUsd, display: `$${monthlyFeeUsd} / month` };
}

