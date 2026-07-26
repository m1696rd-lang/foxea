export const fmtMoney = (n: number | null | undefined, opts: { sign?: boolean } = {}) => {
  const v = Number(n ?? 0);
  const s = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(Math.abs(v));
  if (opts.sign && v > 0) return `+${s}`;
  if (v < 0) return `-${s}`;
  return s;
};
export const fmtPct = (n: number | null | undefined, digits = 2) => {
  const v = Number(n ?? 0);
  return `${v.toFixed(digits)}%`;
};
export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", year: "numeric" }).format(date);
};
export const cn = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

export const fmtDateTime = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(date);
};

export const fmtRelative = (d: string | Date | null | undefined) => {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "hace un momento";
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr} h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `hace ${days} d`;
  return fmtDate(d);
};
