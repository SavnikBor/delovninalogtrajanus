import React, { useEffect, useMemo, useState } from 'react';

interface KooperantVnos {
	stevilkaNaloga: number | string;
	vrsta: string;
	imeKooperanta: string;
	predvidenRok?: string;
	cena?: string;
	_source: any;
}

interface KooperantiPregledProps {
	vsiNalogi: any[];
	onOpenNalog: (stevilkaNaloga: number | string) => void;
}

function parseDate(input?: string): Date | null {
	if (!input) return null;
	// pričakovana oblika YYYY-MM-DD, vendar podpiramo tudi druge
	const iso = /^\d{4}-\d{2}-\d{2}$/;
	if (iso.test(input)) {
		const d = new Date(input + 'T00:00:00');
		return isNaN(d.getTime()) ? null : d;
	}
	// fallback: poskusi new Date
	const d = new Date(input);
	return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function isSameDay(a: Date, b: Date) {
	return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const KooperantiPregled: React.FC<KooperantiPregledProps> = ({ vsiNalogi, onOpenNalog }) => {
	const [now, setNow] = useState<Date>(new Date());

	// Posodabljaj "dan" da se osveži barvanje/filtriranje (1x na minuto je dovolj)
	useEffect(() => {
		const id = setInterval(() => setNow(new Date()), 60 * 1000);
		return () => clearInterval(id);
	}, []);

	const today = useMemo(() => new Date(now.getFullYear(), now.getMonth(), now.getDate()), [now]);

	const vnosi = useMemo(() => {
		const list: KooperantVnos[] = [];

		for (const nalog of vsiNalogi || []) {
			// Zaključen/ dobavljen – skrij
			if (nalog?.status === 'zaključen' || nalog?.dobavljeno === true) continue;
			const st = nalog?.stevilkaNaloga;
			const p = nalog?.podatki || {};

			// Tisk 1/2 kooperant
			const t1 = p?.tisk?.tisk1;
			if (t1?.tiskaKooperant) {
				list.push({
					stevilkaNaloga: st,
					vrsta: 'tisk',
					imeKooperanta: t1.kooperant || '',
					predvidenRok: t1.rokKooperanta || '',
					cena: t1.znesekKooperanta || '',
					_source: { nalog, scope: 'tisk1' }
				});
			}
			const t2 = p?.tisk?.tisk2;
			if (t2?.tiskaKooperant) {
				list.push({
					stevilkaNaloga: st,
					vrsta: 'tisk',
					imeKooperanta: t2.kooperant || '',
					predvidenRok: t2.rokKooperanta || '',
					cena: t2.znesekKooperanta || '',
					_source: { nalog, scope: 'tisk2' }
				});
			}

			// Dodelava 1/2 kooperanti 1..3
			const addDodelava = (d: any, which: 'd1' | 'd2') => {
				if (!d) return;
				for (let i = 1; i <= 3; i++) {
					const flag = d[`kooperant${i}`];
					const data = d[`kooperant${i}Podatki`];
					if (flag && data) {
						list.push({
							stevilkaNaloga: st,
							vrsta: data.vrstaDodelave || 'dodelava',
							imeKooperanta: data.imeKooperanta || '',
							predvidenRok: data.predvidenRok || '',
							cena: data.znesekDodelave || '',
							_source: { nalog, scope: `${which}-kooperant${i}` }
						});
					}
				}
			};
			addDodelava(p?.dodelava1, 'd1');
			addDodelava(p?.dodelava2, 'd2');
		}

		// Filtriraj: odstrani vnose, kjer je rok minil (today > rok)
		const filtered = list.filter((v) => {
			const d = parseDate(v.predvidenRok);
			if (!d) return true; // brez datuma ostane
			if (d.getTime() < today.getTime()) return false; // rok je minil -> odstrani
			return true;
		});

		// Razvrsti: najprej z datumom po naraščajočem, nato brez datuma po številki naloga naraščajoče
		const withDate = filtered.filter(v => !!parseDate(v.predvidenRok));
		const withoutDate = filtered.filter(v => !parseDate(v.predvidenRok));

		withDate.sort((a, b) => {
			const da = parseDate(a.predvidenRok)!.getTime();
			const db = parseDate(b.predvidenRok)!.getTime();
			return da - db;
		});
		withoutDate.sort((a, b) => {
			const sa = Number(a.stevilkaNaloga) || 0;
			const sb = Number(b.stevilkaNaloga) || 0;
			return sa - sb;
		});

		return [...withDate, ...withoutDate];
	}, [vsiNalogi, today]);

	return (
		<div className="bg-white rounded-lg shadow-md p-6">
			<h3 className="text-xl font-semibold mb-4">Pregled kooperantov</h3>
			{vnosi.length === 0 ? (
				<div className="text-gray-600">Ni aktivnih kooperantskih vnosov.</div>
			) : (
				<div className="overflow-auto">
					<table className="min-w-full border border-gray-200 rounded-md">
						<thead className="bg-gray-50">
							<tr>
								<th className="text-left px-3 py-2 border-b">Št. naloga</th>
								<th className="text-left px-3 py-2 border-b">Kooperant</th>
								<th className="text-left px-3 py-2 border-b">Vrsta</th>
								<th className="text-left px-3 py-2 border-b">Predviden rok</th>
								<th className="text-left px-3 py-2 border-b">Cena</th>
							</tr>
						</thead>
						<tbody>
							{vnosi.map((v, idx) => {
								const d = parseDate(v.predvidenRok);
								const isToday = d ? isSameDay(d, today) : false;
								return (
									<tr
										key={`${v.stevilkaNaloga}-${idx}-${v.vrsta}`}
										className={`${isToday ? 'bg-red-50' : ''}`}
									>
										<td className={`px-3 py-2 border-b ${isToday ? 'text-red-800' : 'text-blue-700'}`}>
											<button
												type="button"
												onClick={() => onOpenNalog(v.stevilkaNaloga)}
												className="underline hover:no-underline"
												title="Odpri delovni nalog"
											>
												{v.stevilkaNaloga}
											</button>
										</td>
										<td className={`px-3 py-2 border-b ${isToday ? 'text-red-800' : ''}`}>{v.imeKooperanta || '-'}</td>
										<td className={`px-3 py-2 border-b ${isToday ? 'text-red-800' : ''}`}>{v.vrsta || '-'}</td>
										<td className={`px-3 py-2 border-b ${isToday ? 'text-red-800 font-semibold' : ''}`}>{v.predvidenRok || '-'}</td>
										<td className={`px-3 py-2 border-b ${isToday ? 'text-red-800' : ''}`}>{v.cena || '-'}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
};

export default KooperantiPregled;

