// Wording for network fees on the send screens. Marscoin's smallest unit is
// the zubrin and its transactions are measured in plain bytes.

const group = digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export const feeRateText = rate => `${rate} ${Number(rate) === 1 ? 'zubrin' : 'zubrins'}/byte`;

const fiatText = usd => (usd >= 0.01 ? `$${usd.toFixed(2)}` : 'under $0.01');

// A fee in zubrins as an amount with its dollar value, or null while the fee
// is not known (the coins have not loaded, or the balance cannot cover it).
export function feeAmountText(fee, usdRate) {
  if (!Number.isSafeInteger(fee) || fee <= 0) return null;
  const amount =
    fee >= 1000000
      ? `${(fee / 100000000).toFixed(8).replace(/\.?0+$/, '')} MARS`
      : `${group(String(fee))} ${fee === 1 ? 'zubrin' : 'zubrins'}`;
  const rate = Number(usdRate);
  return Number.isFinite(rate) && rate > 0 ? `${amount} (${fiatText((fee * rate) / 100000000)})` : amount;
}

// The fee row: the amount once it is known, the rate until then. Never a
// made-up "0 zubrin".
export const feeSummaryText = ({ fee, rate, usdRate }) => feeAmountText(fee, usdRate) || feeRateText(rate);

// The one fee line of the send flow: the amount in MARS with its dollar
// value, e.g. "0.00001356 MARS · under $0.01". Null while the fee is unknown.
export function networkFeeText(fee, usdRate) {
  if (!Number.isSafeInteger(fee) || fee <= 0) return null;
  const amount = `${(fee / 100000000).toFixed(8)} MARS`;
  const rate = Number(usdRate);
  return Number.isFinite(rate) && rate > 0 ? `${amount} · ${fiatText((fee * rate) / 100000000)}` : amount;
}

// What is true about speed. Marscoin blocks are nearly empty: every payment
// at or above the minimum rate goes into the next block, and paying more does
// not make it faster.
export const NEXT_BLOCK_TEXT = 'Included in the next block, usually within a few minutes. Blocks sometimes take longer.';
