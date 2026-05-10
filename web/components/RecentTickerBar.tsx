'use client';

export interface RecentTxItem {
  mode: 'TRADE' | 'JEONSE';
  contract_date: string;
  bjd_code: string;
  sigungu: string;
  dong: string;
  complex_name: string;
  area_m2: number;
  amount_man: number;
  floor: number | null;
}

const MODE_ACCENT: Record<RecentTxItem['mode'], string> = {
  TRADE: '#2d8a4f',
  JEONSE: '#5577c8',
};

const MODE_LABEL: Record<RecentTxItem['mode'], string> = {
  TRADE: '매매',
  JEONSE: '전세',
};

function formatMan(man: number): string {
  if (man <= 0) return '0';
  if (man < 10000) {
    if (man % 1000 === 0) return `${man / 1000}천만`;
    return `${man.toLocaleString()}만`;
  }
  const eok = man / 10000;
  if (Math.abs(eok - Math.round(eok)) < 0.01) return `${Math.round(eok)}억`;
  return `${eok.toFixed(1)}억`;
}

function formatShortDate(date: string): string {
  return date.slice(5).replace('-', '/');
}

function formatA11yDate(date: string): string {
  const [, month, day] = date.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

function formatLocation(sigungu: string, dong: string): string {
  return `${sigungu.replace(/구$/, '')}·${dong}`;
}

function formatArea(area: number): string {
  return Number.isInteger(area) ? `${area}㎡` : `${area.toFixed(1)}㎡`;
}

function buildAriaLabel(item: RecentTxItem): string {
  return [
    MODE_LABEL[item.mode],
    formatA11yDate(item.contract_date),
    `${item.sigungu} ${item.dong} ${item.complex_name}`,
    `${formatArea(item.area_m2).replace('㎡', '제곱미터')}`,
    formatMan(item.amount_man),
  ].join(', ');
}

export function RecentTickerBar({
  items,
  onSelectBjd,
}: {
  items: RecentTxItem[] | null;
  onSelectBjd: (bjdCode: string) => void;
}) {
  if (items === null) {
    return <div aria-hidden className="recent-ticker-placeholder" />;
  }
  if (items.length === 0) return null;

  const repeated = [...items, ...items];

  return (
    <div
      role="region"
      aria-label="강북 14구 최근 거래 50건"
      className="recent-ticker-bar"
    >
      <ul className="recent-ticker-track">
        {repeated.map((item, index) => (
          <li
            key={`${item.mode}-${item.bjd_code}-${item.contract_date}-${item.complex_name}-${index}`}
            className="recent-ticker-item"
            aria-hidden={index >= items.length}
          >
            <button
              type="button"
              className="recent-ticker-button"
              aria-label={buildAriaLabel(item)}
              tabIndex={index >= items.length ? -1 : 0}
              onClick={() => onSelectBjd(item.bjd_code)}
            >
              <span
                className="recent-ticker-mode"
                style={{ background: MODE_ACCENT[item.mode] }}
              >
                {MODE_LABEL[item.mode]}
              </span>
              <span>{formatShortDate(item.contract_date)}</span>
              <span>{formatLocation(item.sigungu, item.dong)}</span>
              <span>
                {item.complex_name} {formatArea(item.area_m2)} {formatMan(item.amount_man)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
