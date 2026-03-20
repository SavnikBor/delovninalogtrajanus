import React, { useMemo, useState } from 'react';

interface DostavaTiskovinProps {
	vsiNalogi: any[];
	onOpenNalog: (stevilkaNaloga: number) => void;
}

const formatDatumSI = (datum?: string): string => {
	if (!datum) return '';
	const s = String(datum).trim();
	// ISO (YYYY-MM-DD or YYYY-MM-DDTHH:mm...)
	const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) {
		const y = iso[1];
		const m = String(parseInt(iso[2], 10));
		const d = String(parseInt(iso[3], 10));
		return `${d}.${m}.${y}`;
	}
	// EU (dd.mm.yyyy)
	const eu = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
	if (eu) {
		const d = String(parseInt(eu[1], 10));
		const m = String(parseInt(eu[2], 10));
		const y = eu[3].length === 2 ? `20${eu[3]}` : eu[3];
		return `${d}.${m}.${y}`;
	}
	// fallback: če je kaj v stilu "...T00:00:00.000Z"
	const tSplit = s.split('T')[0];
	if (tSplit && /^\d{4}-\d{2}-\d{2}$/.test(tSplit)) return formatDatumSI(tSplit);
	return s;
};

const parseEuDateTime = (datum?: string, ura?: string): number => {
	if (!datum) return Number.POSITIVE_INFINITY;
	const s = String(datum).trim();
	let y = NaN, m = NaN, d = NaN;
	// ISO first (YYYY-MM-DD...)
	const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (iso) {
		y = Number(iso[1]);
		m = Number(iso[2]);
		d = Number(iso[3]);
	} else {
		// EU dd.mm.yyyy (podpira tudi -, /)
		const parts = s.split(/[.\-\/]/).map((p: string) => p.trim());
		if (parts.length >= 3) {
			d = Number(parts[0]);
			m = Number(parts[1]);
			y = Number(parts[2]);
		}
	}
	if (!y || !m || !d) return Number.POSITIVE_INFINITY;
	const date = new Date(y, m - 1, d);
	if (ura && /^\d{1,2}:\d{2}$/.test(ura)) {
		const [h, min] = ura.split(':').map(Number);
		date.setHours(h || 0, min || 0, 0, 0);
	}
	return date.getTime();
};

const DostavaTiskovin: React.FC<DostavaTiskovinProps> = ({ vsiNalogi, onOpenNalog }) => {
	const [sortKey, setSortKey] = useState<'rok'|'stevilka'>('rok');
	const [selected, setSelected] = useState<Record<number, boolean>>({});

	const elementi = useMemo(() => {
		const list = (vsiNalogi || []).filter((n: any) => {
			const status = String(n?.status || '').toLowerCase();
			const pos = n?.podatki?.posiljanje || {};
			const jeDostava = !!pos?.dostavaNaLokacijo;
			const jeAktiven = status === 'v_delu' || status === 'v teku';
			const niDobavljeno = !n?.dobavljeno;
			return jeAktiven && jeDostava && niDobavljeno;
		});
		list.sort((a: any, b: any) => {
			if (sortKey === 'rok') {
				const at = parseEuDateTime(a?.podatki?.rokIzdelave, a?.podatki?.rokIzdelaveUra);
				const bt = parseEuDateTime(b?.podatki?.rokIzdelave, b?.podatki?.rokIzdelaveUra);
				if (at !== bt) return at - bt;
				const an = Number(a?.stevilkaNaloga) || 0;
				const bn = Number(b?.stevilkaNaloga) || 0;
				return an - bn;
			}
			const an = Number(a?.stevilkaNaloga) || 0;
			const bn = Number(b?.stevilkaNaloga) || 0;
			if (an !== bn) return an - bn;
			const at = parseEuDateTime(a?.podatki?.rokIzdelave, a?.podatki?.rokIzdelaveUra);
			const bt = parseEuDateTime(b?.podatki?.rokIzdelave, b?.podatki?.rokIzdelaveUra);
			return at - bt;
		});
		return list;
	}, [vsiNalogi, sortKey]);

	const anySelected = useMemo(() => Object.values(selected).some(Boolean), [selected]);

	const toggleSelected = (st: number, checked: boolean) => {
		setSelected(prev => ({ ...prev, [st]: checked }));
	};

	const handlePrintSelected = () => {
		const chosen = elementi.filter((n: any) => selected[Number(n?.stevilkaNaloga)]);
		if (chosen.length === 0) return;
		const htmlRows = chosen.map((n: any) => {
			const pos = n?.podatki?.posiljanje || {};
			const rokStr = formatDatumSI(n?.podatki?.rokIzdelave) || '-';
			const predmet =
				(n?.podatki?.tisk?.tisk1?.predmet || '').toString().trim() ||
				(n?.podatki?.tisk?.tisk2?.predmet || '').toString().trim();
			const naslovLines = [
				(pos?.naziv || '').trim(),
				(pos?.naslov || '').trim(),
				[((pos?.postnaStevilka || '').trim()), ((pos?.kraj || '').trim())].filter(Boolean).join(' ')
			].filter(Boolean);
			const kontaktLines = [
				(pos?.kontaktnaOseba ? `Kontaktna oseba: ${pos?.kontaktnaOseba}` : ''),
				(pos?.kontakt ? `Kontakt: ${pos?.kontakt}` : '')
			].filter(Boolean);
			const naslovHtml = (naslovLines.length > 0 || kontaktLines.length > 0)
				? `<div>${[...naslovLines, ...kontaktLines].map(l => `<div>${l}</div>`).join('')}</div>`
				: '-';
			return `
				<tr>
					<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${n?.stevilkaNaloga ?? ''}</td>
					<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${n?.podatki?.kupec?.Naziv || ''}</td>
					<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${predmet || ''}</td>
					<td style="padding:6px 8px;border-bottom:1px solid #ddd; white-space:nowrap;">${rokStr}</td>
					<td style="padding:6px 8px;border-bottom:1px solid #ddd;">${naslovHtml}</td>
				</tr>
			`;
		}).join('');

		const html = `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="utf-8" />
				<title>Dostava tiskovin - izpis</title>
				<style>
					body { font-family: Arial, sans-serif; padding: 16px; }
					h1 { margin-bottom: 8px; }
					table { border-collapse: collapse; width: 100%; }
					th { text-align: left; border-bottom: 2px solid #000; padding: 6px 8px; }
				</style>
			</head>
			<body>
				<h1>Dostava tiskovin</h1>
				<table>
					<thead>
						<tr>
							<th>Št.</th>
							<th>Kupec</th>
							<th>Predmet</th>
							<th>Rok dostave</th>
							<th>Naslov / Kontakt</th>
						</tr>
					</thead>
					<tbody>
						${htmlRows}
					</tbody>
				</table>
				<script>
					window.onload = function() { window.print(); }
				</script>
			</body>
			</html>
		`;
		const w = window.open('', '_blank');
		if (w) {
			w.document.open();
			w.document.write(html);
			w.document.close();
		}
	};

	return (
		<div className="bg-white rounded-lg shadow-md p-6 mb-6">
			<h2 className="text-2xl font-bold mb-2">Dostava tiskovin</h2>
			<p className="text-gray-600 mb-4 text-sm">
				Seznam aktivnih nalogov z izbrano »Dostava na lokacijo«. Nalog ostane na seznamu do oznake »Dobavljeno«.
			</p>
			<div className="overflow-x-auto">
				{anySelected && (
					<div className="mb-3">
						<button
							type="button"
							className="px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
							onClick={handlePrintSelected}
						>
							Natisni izbrane
						</button>
					</div>
				)}
				<table className="min-w-full border border-gray-200 text-sm">
					<thead className="bg-gray-50">
						<tr>
							<th
								className="px-3 py-2 text-left border-b cursor-pointer select-none"
								onClick={() => setSortKey('stevilka')}
								title="Razvrsti po številki delovnega naloga"
							>
								Št.
							</th>
							<th className="px-3 py-2 text-left border-b">Kupec</th>
							<th className="px-3 py-2 text-left border-b">Predmet</th>
							<th
								className="px-3 py-2 text-left border-b cursor-pointer select-none"
								onClick={() => setSortKey('rok')}
								title="Razvrsti po roku dostave"
							>
								Rok dostave
							</th>
							<th className="px-3 py-2 text-left border-b">Naslov dostave</th>
							<th className="px-3 py-2 text-left border-b">Izvoz pod.</th>
						</tr>
					</thead>
					<tbody>
						{elementi.length === 0 && (
							<tr>
								<td className="px-3 py-3 text-gray-500 text-center" colSpan={6}>
									Ni aktivnih dostav.
								</td>
							</tr>
						)}
						{elementi.map((n: any) => {
							const pos = n?.podatki?.posiljanje || {};
							const rokStr = formatDatumSI(n?.podatki?.rokIzdelave);
							const naslovLines = [
								(pos?.naziv || '').trim(),
								(pos?.naslov || '').trim(),
								[((pos?.postnaStevilka || '').trim()), ((pos?.kraj || '').trim())].filter(Boolean).join(' '),
								(pos?.kontaktnaOseba ? `Kontaktna oseba: ${pos?.kontaktnaOseba}` : ''),
								(pos?.kontakt ? `Kontakt: ${pos?.kontakt}` : '')
							].filter(Boolean);
							const predmet =
								(n?.podatki?.tisk?.tisk1?.predmet || '').toString().trim() ||
								(n?.podatki?.tisk?.tisk2?.predmet || '').toString().trim();
							return (
								<tr
									key={String(n?.stevilkaNaloga)}
									className="hover:bg-gray-50"
								>
									<td className="px-3 py-2 border-b whitespace-nowrap text-blue-700">
										<button
											type="button"
											onClick={() => onOpenNalog(Number(n?.stevilkaNaloga))}
											className="underline hover:no-underline"
											title="Odpri delovni nalog"
										>
											{n?.stevilkaNaloga}
										</button>
									</td>
									<td className="px-3 py-2 border-b">{n?.podatki?.kupec?.Naziv || '-'}</td>
									<td className="px-3 py-2 border-b">{predmet || '-'}</td>
									<td className="px-3 py-2 border-b whitespace-nowrap">{rokStr || '-'}</td>
									<td className="px-3 py-2 border-b">
										{naslovLines.length > 0 ? (
											<div className="leading-tight">
												{naslovLines.map((line, idx) => (
													<div key={idx}>{line}</div>
												))}
											</div>
										) : (
											'-'
										)}
									</td>
									<td className="px-3 py-2 border-b">
										<input
											type="checkbox"
											checked={!!selected[Number(n?.stevilkaNaloga)]}
											onChange={(e) => {
												e.stopPropagation();
												toggleSelected(Number(n?.stevilkaNaloga), e.target.checked);
											}}
											onClick={(e) => e.stopPropagation()}
											className="rounded"
										/>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
};

export default DostavaTiskovin;


