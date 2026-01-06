import React, { useState, useMemo, useEffect } from 'react';

interface CasSekcije {
  tisk: number;
  uvTisk: number;
  plastifikacija: number;
  uvLak: number;
  izsek: number;
  razrez: number;
  topliTisk: number;
  biganje: number;
  biganjeRocnoZgibanje: number;
  zgibanje: number;
  lepljenje: number;
  lepljenjeBlokov: number;
  vezava: number;
  vrtanjeLuknje: number;
  perforacija: number;
  kooperanti: number;
  skupaj: number;
}

interface PrioritetaNaloga {
  stevilkaNaloga: number;
  predvideniCas: number; // v minutah
  casSekcije: CasSekcije;
  rokIzdelave: string;
  rokIzdelaveUra: string;
  prioriteta: number; // 1-5 (1=najvišja, 5=najnižja)
  status: 'v_delu' | 'zakljucen' | 'dobavljeno';
  podatki: any;
  preostaliCasDoRoka: number; // v minutah
}

interface PrioritetniNalogiProps {
  prioritetniNalogi: PrioritetaNaloga[];
  onIzberi: (nalog: any) => void;
  onClosedTasksChange?: (closedTasks: ClosedTask[]) => void;
  closedTasks?: ClosedTask[];
}

interface ClosedTask {
  stevilkaNaloga: number;
  taskType: string;
}

interface Storitev {
  naziv: string;
  skupniCas: number; // v minutah
  nalogi: Array<{
    stevilkaNaloga: number;
    cas: number; // v minutah
    naziv: string;
  }>;
}

const PrioritetniNalogi: React.FC<PrioritetniNalogiProps> = ({ prioritetniNalogi, onIzberi, onClosedTasksChange, closedTasks = [] }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [originalTasks, setOriginalTasks] = useState<Map<number, any>>(new Map());
  
  // Funkcija za preverjanje, ali je delovni dan
  const jeDelovniDan = (datum: Date): boolean => {
    const dan = datum.getDay();
    return dan >= 1 && dan <= 5; // Ponedeljek = 1, Petek = 5
  };
  
  const formatirajCas = (minute: number): string => {
    const ure = Math.floor(minute / 60);
    const min = Math.round(minute % 60);
    if (ure > 0) {
      return `${ure}h ${min}min`;
    }
    return `${min}min`;
  };

  // Funkcija za izračun delovnih ur med dvema datumoma
  const izracunajDelovneUre = (zacetek: Date, konec: Date): number => {
    let delovneUre = 0;
    let trenutniDan = new Date(zacetek);
    
    // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
    if (zacetek.getHours() >= 15) {
      trenutniDan = new Date(zacetek);
      trenutniDan.setDate(trenutniDan.getDate() + 1);
      // Poišči naslednji delovni dan
      while (trenutniDan.getDay() === 0 || trenutniDan.getDay() === 6) {
        trenutniDan.setDate(trenutniDan.getDate() + 1);
      }
      trenutniDan.setHours(7, 0, 0, 0); // Začni ob 7:00
    }
    // Če je trenutni čas pred 7:00, začni ob 7:00 istega dne
    else if (zacetek.getHours() < 7) {
      trenutniDan = new Date(zacetek);
      trenutniDan.setHours(7, 0, 0, 0);
    }
    // Če je trenutni čas med 7:00 in 15:00, uporabi trenutni čas
    else {
      trenutniDan = new Date(zacetek);
    }
    
    // Če je konec pred začetkom, vrni 0
    if (konec <= trenutniDan) {
      return 0;
    }
    
    // Če sta začetek in konec isti dan
    if (trenutniDan.getDate() === konec.getDate() && 
        trenutniDan.getMonth() === konec.getMonth() && 
        trenutniDan.getFullYear() === konec.getFullYear()) {
      const zacetekUra = Math.max(7, trenutniDan.getHours() + trenutniDan.getMinutes() / 60);
      const konecUra = Math.min(15, konec.getHours() + konec.getMinutes() / 60);
      return Math.max(0, konecUra - zacetekUra);
    }
    
    // Izračunaj čas za prvi dan (trenutni dan)
    if (trenutniDan.getDay() >= 1 && trenutniDan.getDay() <= 5) { // Delovni dan
      const zacetekUra = Math.max(7, trenutniDan.getHours() + trenutniDan.getMinutes() / 60);
      delovneUre += Math.max(0, 15 - zacetekUra);
    }
    
    // Poišči naslednji dan
    let naslednjiDan = new Date(trenutniDan);
    naslednjiDan.setDate(naslednjiDan.getDate() + 1);
    naslednjiDan.setHours(7, 0, 0, 0);
    
    // Izračunaj čas za vmesne dneve (polni delovni dnevi)
    // Preveri vse dneve med naslednjim dnem in dnem roka (vključno)
    while (naslednjiDan < konec) {
      // Če je to dan roka, izračunaj delni čas
      if (naslednjiDan.getDate() === konec.getDate() && 
          naslednjiDan.getMonth() === konec.getMonth() && 
          naslednjiDan.getFullYear() === konec.getFullYear()) {
        if (naslednjiDan.getDay() >= 1 && naslednjiDan.getDay() <= 5) { // Delovni dan
          const konecUra = Math.min(15, konec.getHours() + konec.getMinutes() / 60);
          delovneUre += Math.max(0, konecUra - 7);
        }
        break;
      }
      
      // Če ni dan roka, dodaj polni delovni dan
      if (naslednjiDan.getDay() >= 1 && naslednjiDan.getDay() <= 5) { // Delovni dan
        delovneUre += 8; // 8 delovnih ur na dan
      }
      
      naslednjiDan.setDate(naslednjiDan.getDate() + 1);
    }
    
    return delovneUre;
  };

  // Funkcija za izračun časa do roka z upoštevanjem delovnih ur
  const izracunajCasDoRoka = (nalog: PrioritetaNaloga): number => {
    if (!nalog.rokIzdelave) return 0;
    
    const datumRoka = new Date(nalog.rokIzdelave);
    let konecRoka = new Date(datumRoka);
    
    // Nastavi konec roka z uro
    if (nalog.rokIzdelaveUra) {
      const [ure, minute] = nalog.rokIzdelaveUra.split(':').map(Number);
      konecRoka.setHours(ure, minute, 0, 0);
    } else {
      konecRoka.setHours(15, 0, 0, 0);
    }
    
    // Določi začetek dela - uporabi trenutni čas
    let zacetekDela = new Date(currentTime);
    
    // Če je trenutni čas po 15:00, začni z naslednjim delovnim dnem ob 7:00
    if (currentTime.getHours() >= 15) {
      zacetekDela = new Date(currentTime);
      zacetekDela.setDate(zacetekDela.getDate() + 1);
      // Poišči naslednji delovni dan
      while (zacetekDela.getDay() === 0 || zacetekDela.getDay() === 6) {
        zacetekDela.setDate(zacetekDela.getDate() + 1);
      }
      zacetekDela.setHours(7, 0, 0, 0);
    } else if (!jeDelovniDan(currentTime)) {
      // Če ni delovni dan, se rok začne naslednji delovni dan ob 7:00
      zacetekDela = new Date(currentTime);
      zacetekDela.setDate(zacetekDela.getDate() + 1);
      while (zacetekDela.getDay() === 0 || zacetekDela.getDay() === 6) {
        zacetekDela.setDate(zacetekDela.getDate() + 1);
      }
      zacetekDela.setHours(7, 0, 0, 0);
    } else {
      // Če je delovni dan pred 15:00, se rok začne ob trenutnem času
      zacetekDela = new Date(currentTime);
    }
    
    // Izračun delovnih ur do roka
    const delovneUreDoRoka = izracunajDelovneUre(zacetekDela, konecRoka);
    return Math.round(delovneUreDoRoka * 60); // pretvori v minute
  };

  const formatirajCasDoRoka = (preostaliCas: number): string => {
    if (preostaliCas < 0) {
      const prekoraceneUre = Math.abs(Math.floor(preostaliCas / 60));
      const prekoraceneMinute = Math.abs(preostaliCas % 60);
      return `Prekoračen za ${prekoraceneUre}h ${prekoraceneMinute}min`;
    } else {
      const ure = Math.floor(preostaliCas / 60);
      const minute = preostaliCas % 60;
      return `${ure}h ${minute}min`;
    }
  };

  // Timer za dinamično posodabljanje časa
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Posodobi vsako minuto

    return () => clearInterval(timer);
  }, []);



  // Shrani originalne naloge ob prvem naloženju
  useEffect(() => {
    if (prioritetniNalogi.length > 0 && originalTasks.size === 0) {
      const originalMap = new Map();
      prioritetniNalogi.forEach(nalog => {
        originalMap.set(nalog.stevilkaNaloga, { ...nalog });
      });
      setOriginalTasks(originalMap);
    }
  }, [prioritetniNalogi, originalTasks.size]);

  // Funkcija za zapiranje dodelave
  const handleCloseTask = (stevilkaNaloga: number, taskType: string) => {
    console.log('Zapiranje dodelave:', stevilkaNaloga, taskType);
    if (onClosedTasksChange) {
      onClosedTasksChange([...closedTasks, { stevilkaNaloga, taskType }]);
    }
  };

  // Funkcija za ponastavitev naloga
  const handleResetNalog = (stevilkaNaloga: number) => {
    console.log('Ponastavitev naloga:', stevilkaNaloga);
    if (onClosedTasksChange) {
      onClosedTasksChange(closedTasks.filter(task => task.stevilkaNaloga !== stevilkaNaloga));
    }
  };

  // Funkcija za preverjanje ali je dodelava zaprta
  const isTaskClosed = (stevilkaNaloga: number, taskType: string): boolean => {
    return closedTasks.some(task => task.stevilkaNaloga === stevilkaNaloga && task.taskType === taskType);
  };

  // Funkcija za izračun skupnega časa brez zaprtih dodelav
  const izracunajSkupniCasBrezZaprtih = (nalog: PrioritetaNaloga): number => {
    let skupniCas = 0;
    const casSekcije = nalog.casSekcije;
    
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Tisk') && casSekcije.tisk > 0) {
      skupniCas += casSekcije.tisk;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk') && casSekcije.uvTisk > 0) {
      skupniCas += casSekcije.uvTisk;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija') && casSekcije.plastifikacija > 0) {
      skupniCas += casSekcije.plastifikacija;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'UV Lak') && casSekcije.uvLak > 0) {
      skupniCas += casSekcije.uvLak;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek') && casSekcije.izsek > 0) {
      skupniCas += casSekcije.izsek;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Razrez') && casSekcije.razrez > 0) {
      skupniCas += casSekcije.razrez;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk') && casSekcije.topliTisk > 0) {
      skupniCas += casSekcije.topliTisk;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje') && casSekcije.biganje > 0) {
      skupniCas += casSekcije.biganje;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje') && casSekcije.biganjeRocnoZgibanje > 0) {
      skupniCas += casSekcije.biganjeRocnoZgibanje;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje') && casSekcije.zgibanje > 0) {
      skupniCas += casSekcije.zgibanje;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje') && casSekcije.lepljenje > 0) {
      skupniCas += casSekcije.lepljenje;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov') && casSekcije.lepljenjeBlokov > 0) {
      skupniCas += casSekcije.lepljenjeBlokov;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Vezava') && casSekcije.vezava > 0) {
      skupniCas += casSekcije.vezava;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje') && casSekcije.vrtanjeLuknje > 0) {
      skupniCas += casSekcije.vrtanjeLuknje;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Perforacija') && casSekcije.perforacija > 0) {
      skupniCas += casSekcije.perforacija;
    }
    if (!isTaskClosed(nalog.stevilkaNaloga, 'Kooperanti') && casSekcije.kooperanti > 0) {
      skupniCas += casSekcije.kooperanti;
    }
    
    return skupniCas;
  };

  // Funkcija za izračun prioritete z upoštevanjem zaprtih dodelav
  const izracunajPrioriteto = (nalog: PrioritetaNaloga): number => {
    // Če ni določenega datuma ali ure, je prioriteta nizka (5)
    if (!nalog.rokIzdelave) return 5;
    
    const skupniCas = izracunajSkupniCasBrezZaprtih(nalog);
    const casDoRoka = izracunajCasDoRoka(nalog);
    const razlikaCas = casDoRoka - skupniCas;
    
    if (razlikaCas < 0) return 1; // prekoračen rok
    if (razlikaCas <= 120) return 2; // rok izdelave med 0-2 h (120 min)
    if (razlikaCas <= 300) return 3; // rok izdelave med 2-5 h (300 min)
    if (razlikaCas <= 960) return 4; // rok izdelave med 5-16 h (960 min)
    return 5; // rok izdelave več od 16 h
  };

  // Izračun obremenitve storitev
  const obremenitevStoritev = useMemo((): Storitev[] => {
    const storitve: { [key: string]: Storitev } = {};
    
    prioritetniNalogi.forEach(nalog => {
      const sekcije = nalog.casSekcije;
      
      // Tisk
      if (sekcije.tisk > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Tisk')) {
        if (!storitve['Tisk']) storitve['Tisk'] = { naziv: 'Tisk', skupniCas: 0, nalogi: [] };
        storitve['Tisk'].skupniCas += sekcije.tisk;
        storitve['Tisk'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.tisk,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // UV Tisk
      if (sekcije.uvTisk > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk')) {
        if (!storitve['UV Tisk']) storitve['UV Tisk'] = { naziv: 'UV Tisk', skupniCas: 0, nalogi: [] };
        storitve['UV Tisk'].skupniCas += sekcije.uvTisk;
        storitve['UV Tisk'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.uvTisk,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Plastifikacija
      if (sekcije.plastifikacija > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija')) {
        if (!storitve['Plastifikacija']) storitve['Plastifikacija'] = { naziv: 'Plastifikacija', skupniCas: 0, nalogi: [] };
        storitve['Plastifikacija'].skupniCas += sekcije.plastifikacija;
        storitve['Plastifikacija'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.plastifikacija,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // UV Lak
      if (sekcije.uvLak > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'UV Lak')) {
        if (!storitve['UV Lak']) storitve['UV Lak'] = { naziv: 'UV Lak', skupniCas: 0, nalogi: [] };
        storitve['UV Lak'].skupniCas += sekcije.uvLak;
        storitve['UV Lak'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.uvLak,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Izsek/Zasek
      if (sekcije.izsek > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek')) {
        if (!storitve['Izsek/Zasek']) storitve['Izsek/Zasek'] = { naziv: 'Izsek/Zasek', skupniCas: 0, nalogi: [] };
        storitve['Izsek/Zasek'].skupniCas += sekcije.izsek;
        storitve['Izsek/Zasek'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.izsek,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Razrez
      if (sekcije.razrez > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Razrez')) {
        if (!storitve['Razrez']) storitve['Razrez'] = { naziv: 'Razrez', skupniCas: 0, nalogi: [] };
        storitve['Razrez'].skupniCas += sekcije.razrez;
        storitve['Razrez'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.razrez,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Topli tisk, reliefni tisk, globoki tisk
      if (sekcije.topliTisk > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk')) {
        if (!storitve['Topli tisk']) storitve['Topli tisk'] = { naziv: 'Topli tisk', skupniCas: 0, nalogi: [] };
        storitve['Topli tisk'].skupniCas += sekcije.topliTisk;
        storitve['Topli tisk'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.topliTisk,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Biganje
      if (sekcije.biganje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje')) {
        if (!storitve['Biganje']) storitve['Biganje'] = { naziv: 'Biganje', skupniCas: 0, nalogi: [] };
        storitve['Biganje'].skupniCas += sekcije.biganje;
        storitve['Biganje'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.biganje,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Biganje + ročno zgibanje
      if (sekcije.biganjeRocnoZgibanje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje')) {
        if (!storitve['Biganje + ročno zgibanje']) storitve['Biganje + ročno zgibanje'] = { naziv: 'Biganje + ročno zgibanje', skupniCas: 0, nalogi: [] };
        storitve['Biganje + ročno zgibanje'].skupniCas += sekcije.biganjeRocnoZgibanje;
        storitve['Biganje + ročno zgibanje'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.biganjeRocnoZgibanje,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Zgibanje
      if (sekcije.zgibanje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje')) {
        if (!storitve['Zgibanje']) storitve['Zgibanje'] = { naziv: 'Zgibanje', skupniCas: 0, nalogi: [] };
        storitve['Zgibanje'].skupniCas += sekcije.zgibanje;
        storitve['Zgibanje'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.zgibanje,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Lepljenje (lepljenje lepilnega traku)
      if (sekcije.lepljenje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje')) {
        if (!storitve['Lepljenje']) storitve['Lepljenje'] = { naziv: 'Lepljenje', skupniCas: 0, nalogi: [] };
        storitve['Lepljenje'].skupniCas += sekcije.lepljenje;
        storitve['Lepljenje'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.lepljenje,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Lepljenje blokov
      if (sekcije.lepljenjeBlokov > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov')) {
        if (!storitve['Lepljenje blokov']) storitve['Lepljenje blokov'] = { naziv: 'Lepljenje blokov', skupniCas: 0, nalogi: [] };
        storitve['Lepljenje blokov'].skupniCas += sekcije.lepljenjeBlokov;
        storitve['Lepljenje blokov'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.lepljenjeBlokov,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Vezava
      if (sekcije.vezava > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Vezava')) {
        if (!storitve['Vezava']) storitve['Vezava'] = { naziv: 'Vezava', skupniCas: 0, nalogi: [] };
        storitve['Vezava'].skupniCas += sekcije.vezava;
        storitve['Vezava'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.vezava,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Vrtanje luknje
      if (sekcije.vrtanjeLuknje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje')) {
        if (!storitve['Vrtanje luknje']) storitve['Vrtanje luknje'] = { naziv: 'Vrtanje luknje', skupniCas: 0, nalogi: [] };
        storitve['Vrtanje luknje'].skupniCas += sekcije.vrtanjeLuknje;
        storitve['Vrtanje luknje'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.vrtanjeLuknje,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Perforacija
      if (sekcije.perforacija > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Perforacija')) {
        if (!storitve['Perforacija']) storitve['Perforacija'] = { naziv: 'Perforacija', skupniCas: 0, nalogi: [] };
        storitve['Perforacija'].skupniCas += sekcije.perforacija;
        storitve['Perforacija'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.perforacija,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
      
      // Kooperanti
      if (sekcije.kooperanti > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Kooperanti')) {
        if (!storitve['Kooperanti']) storitve['Kooperanti'] = { naziv: 'Kooperanti', skupniCas: 0, nalogi: [] };
        storitve['Kooperanti'].skupniCas += sekcije.kooperanti;
        storitve['Kooperanti'].nalogi.push({
          stevilkaNaloga: nalog.stevilkaNaloga,
          cas: sekcije.kooperanti,
          naziv: nalog.podatki?.naziv || `Nalog ${nalog.stevilkaNaloga}`
        });
      }
    });
    
    return Object.values(storitve).sort((a, b) => b.skupniCas - a.skupniCas);
  }, [prioritetniNalogi, closedTasks]);

  const formatirajDatum = (datum: string): string => {
    if (!datum) return '';
    const date = new Date(datum);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const formatirajDatumInUro = (datum: string, ura: string): string => {
    if (!datum) return '';
    const date = new Date(datum);
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const datumStr = `${day}.${month}.${year}`;
    
    if (ura) {
      return `${datumStr} ob ${ura}`;
    }
    return datumStr;
  };

  const getPrioritetaBarva = (prioriteta: number): string => {
    switch (prioriteta) {
      case 1: return 'bg-purple-800 text-white'; // Najvišja prioriteta - temno vijolična
      case 2: return 'bg-red-600 text-white'; // Visoka prioriteta - temno rdeča
      case 3: return 'bg-orange-400 text-white'; // Srednja prioriteta - oranžna
      case 4: return 'bg-yellow-400 text-black'; // Nizka prioriteta - rumena
      case 5: return 'bg-green-400 text-white'; // Najnižja prioriteta - zelena
      default: return 'bg-gray-400 text-white'; // Ni prioritete
    }
  };

  const getPrioritetaText = (prioriteta: number): string => {
    switch (prioriteta) {
      case 1: return 'KRITIČNO';
      case 2: return 'URGENTNO';
      case 3: return 'POMEMBNO';
      case 4: return 'OBIČAJNO';
      case 5: return 'NIZKA';
      default: return 'N/A';
    }
  };

  const getPrioritetaOpis = (prioriteta: number): string => {
    switch (prioriteta) {
      case 1: return 'Prekoračen rok';
      case 2: return 'Rok 0-2h';
      case 3: return 'Rok 2-5h';
      case 4: return 'Rok 5-16h';
      case 5: return 'Rok >16h';
      default: return 'N/A';
    }
  };

  // Funkcija za preverjanje, ali je mogoče izračunati vsaj 1 časovno komponento
  const lahkoIzracunamoCas = (nalog: PrioritetaNaloga): boolean => {
    const casSekcije = nalog.casSekcije;
    return casSekcije.tisk > 0 || casSekcije.uvTisk > 0 || casSekcije.plastifikacija > 0 || 
           casSekcije.uvLak > 0 || casSekcije.izsek > 0 || casSekcije.razrez > 0 || casSekcije.topliTisk > 0 || 
           casSekcije.biganje > 0 || casSekcije.biganjeRocnoZgibanje > 0 || casSekcije.zgibanje > 0 || 
           casSekcije.lepljenje > 0 || casSekcije.lepljenjeBlokov > 0 || casSekcije.vezava > 0 || 
           casSekcije.vrtanjeLuknje > 0 || casSekcije.perforacija > 0 || casSekcije.kooperanti > 0;
  };

  // Filtriraj naloge glede na prioriteto in leto
  const filtriraniNalogi = useMemo(() => {
    let filtrirani = prioritetniNalogi;
    
    // Filter: prikaži le naloge, katerim je možno izračunati vsaj 1 časovno komponento
    filtrirani = filtrirani.filter(lahkoIzracunamoCas);
    
    // Razvrsti po prioriteti in roku izdelave
    filtrirani.sort((a, b) => {
      // Najprej po prioriteti (1 je najvišja) - uporabi dinamično izračunano prioriteto
      const prioritetaA = izracunajPrioriteto(a);
      const prioritetaB = izracunajPrioriteto(b);
      if (prioritetaA !== prioritetaB) {
        return prioritetaA - prioritetaB;
      }
      // Če je prioriteta enaka, po datumu roka
      if (a.rokIzdelave && b.rokIzdelave) {
        return new Date(a.rokIzdelave).getTime() - new Date(b.rokIzdelave).getTime();
      }
      // Če ni roka, po številki naloga
      return a.stevilkaNaloga - b.stevilkaNaloga;
    });
    
    return filtrirani;
  }, [prioritetniNalogi, closedTasks, currentTime]);

  // Funkcija za preverjanje ali so vsi oblački zaprti
  const soVsiOblackiZaprti = (nalog: PrioritetaNaloga): boolean => {
    const casSekcije = nalog.casSekcije;
    
    // Preveri vse sekcije, ki imajo čas > 0
    const sekcije = [
      { tip: 'Tisk', cas: casSekcije.tisk },
      { tip: 'UV Tisk', cas: casSekcije.uvTisk },
      { tip: 'Plastifikacija', cas: casSekcije.plastifikacija },
      { tip: 'UV Lak', cas: casSekcije.uvLak },
      { tip: 'Izsek/Zasek', cas: casSekcije.izsek },
      { tip: 'Razrez', cas: casSekcije.razrez },
      { tip: 'Topli tisk', cas: casSekcije.topliTisk },
      { tip: 'Biganje', cas: casSekcije.biganje },
      { tip: 'Biganje + ročno zgibanje', cas: casSekcije.biganjeRocnoZgibanje },
      { tip: 'Zgibanje', cas: casSekcije.zgibanje },
      { tip: 'Lepljenje', cas: casSekcije.lepljenje },
      { tip: 'Lepljenje blokov', cas: casSekcije.lepljenjeBlokov },
      { tip: 'Vezava', cas: casSekcije.vezava },
      { tip: 'Vrtanje luknje', cas: casSekcije.vrtanjeLuknje },
      { tip: 'Perforacija', cas: casSekcije.perforacija },
      { tip: 'Kooperanti', cas: casSekcije.kooperanti }
    ];
    
    // Preveri, ali so vsi oblački z časom > 0 zaprti
    return sekcije.every(sekcija => {
      if (sekcija.cas > 0) {
        return isTaskClosed(nalog.stevilkaNaloga, sekcija.tip);
      }
      return true; // Če sekcija nima časa, je "zaprta"
    });
  };

  // Funkcija za pridobitev barve dodelave
  const getDodelavaBarva = (dodelava: string): string => {
    switch (dodelava) {
      case 'Tisk': return 'bg-blue-100 text-blue-800';
      case 'UV Tisk': return 'bg-purple-100 text-purple-800';
      case 'Plastifikacija': return 'bg-green-100 text-green-800';
      case 'UV Lak': return 'bg-yellow-100 text-yellow-800';
      case 'Izsek/Zasek': return 'bg-red-100 text-red-800';
      case 'Razrez': return 'bg-indigo-100 text-indigo-800';
      case 'Topli tisk': return 'bg-orange-100 text-orange-800';
      case 'Biganje': return 'bg-indigo-100 text-indigo-800';
      case 'Biganje + ročno zgibanje': return 'bg-indigo-100 text-indigo-800';
      case 'Zgibanje': return 'bg-pink-100 text-pink-800';
      case 'Lepljenje': return 'bg-teal-100 text-teal-800';
      case 'Lepljenje blokov': return 'bg-teal-100 text-teal-800';
      case 'Vezava': return 'bg-cyan-100 text-cyan-800';
      case 'Vrtanje luknje': return 'bg-gray-100 text-gray-800';
      case 'Perforacija': return 'bg-lime-100 text-lime-800';
      case 'Kooperanti': return 'bg-amber-100 text-amber-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="w-full h-full flex bg-white">
      {/* Glavni prikaz */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-gray-100 border-b p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Prioritetni Nalogi</h2>
            <p className="text-sm text-gray-600 mt-1">
              Seznam aktivnih nalogov razvrščenih po prioriteti in roku izdelave
            </p>
            <div className="mt-3 flex gap-2 text-xs">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-purple-800"></div>
                <span>Kritično (prekoračen)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-red-600"></div>
                <span>Urgentno (0-2h)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-orange-400"></div>
                <span>Pomembno (2-5h)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <span>Običajno (5-16h)</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
                <span>Nizka ({'>16h'})</span>
              </div>
            </div>
          </div>
        </div>

        {/* Seznam nalogov in obremenitev storitev */}
        <div className="flex-1 flex">
          {/* Seznam nalogov */}
          <div className="flex-1 overflow-y-auto">
            {filtriraniNalogi.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-lg font-medium">Ni aktivnih nalogov</p>
                <p className="text-sm">Vsi nalogi so zaključeni ali dobavljeni</p>
              </div>
            ) : (
              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {filtriraniNalogi.map((nalog) => (
                  <div
                    key={nalog.stevilkaNaloga}
                    className="border rounded-lg p-3 hover:shadow-md transition-shadow bg-white"
                  >
                    {/* Header vrstice */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-bold text-blue-600">#{nalog.stevilkaNaloga}</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold ${getPrioritetaBarva(izracunajPrioriteto(nalog))}`}>
                          {getPrioritetaText(izracunajPrioriteto(nalog))}
                        </span>
                      </div>
                      <div className="text-right text-xs">
                        <div className="text-gray-600">Rok: {formatirajDatumInUro(nalog.rokIzdelave, nalog.rokIzdelaveUra)}</div>
                        <div className={`font-medium ${izracunajCasDoRoka(nalog) < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          Do roka: {formatirajCasDoRoka(izracunajCasDoRoka(nalog))}
                        </div>
                      </div>
                    </div>

                    {/* Kupec in predmeti v eni vrstici */}
                    <div className="mb-3">
                      <div className="text-sm font-semibold text-gray-800 mb-1">
                        {nalog.podatki?.kupec?.Naziv || 'Ni podatkov o kupcu'}
                      </div>
                      <div className="text-xs text-gray-600">
                        {nalog.podatki?.tisk?.tisk1?.predmet || 'Ni predmeta'} 
                        {nalog.podatki?.tisk?.tisk2?.predmet && ` / ${nalog.podatki.tisk.tisk2.predmet}`}
                      </div>
                    </div>

                    {/* Časovni podatki v eni vrstici */}
                    <div className="flex justify-between items-center mb-3 text-sm">
                      <div>
                        <span className="text-gray-600">Skupaj: </span>
                        <span className="font-semibold">{formatirajCas(izracunajSkupniCasBrezZaprtih(nalog))}</span>
                      </div>
                    </div>

                    {/* Razčlenitev po sekcijah - kompaktno */}
                    <div className="mb-3">
                      <div className="text-xs font-medium text-gray-700 mb-1">Sekcije:</div>
                      <div className="flex flex-wrap gap-1">
                        {nalog.casSekcije.tisk > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Tisk') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Tisk')}`}>
                            Tisk: {formatirajCas(nalog.casSekcije.tisk)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Tisk')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.uvTisk > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'UV Tisk') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('UV Tisk')}`}>
                            UV Tisk: {formatirajCas(nalog.casSekcije.uvTisk)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'UV Tisk')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.plastifikacija > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Plastifikacija') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Plastifikacija')}`}>
                            Plastifikacija: {formatirajCas(nalog.casSekcije.plastifikacija)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Plastifikacija')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.uvLak > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'UV Lak') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('UV Lak')}`}>
                            UV Lak: {formatirajCas(nalog.casSekcije.uvLak)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'UV Lak')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.izsek > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Izsek/Zasek') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Izsek/Zasek')}`}>
                            Izsek/Zasek: {formatirajCas(nalog.casSekcije.izsek)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Izsek/Zasek')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.razrez > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Razrez') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Razrez')}`}>
                            Razrez: {formatirajCas(nalog.casSekcije.razrez)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Razrez')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.topliTisk > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Topli tisk') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Topli tisk')}`}>
                            Topli tisk: {formatirajCas(nalog.casSekcije.topliTisk)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Topli tisk')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.biganje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Biganje')}`}>
                            Biganje: {formatirajCas(nalog.casSekcije.biganje)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Biganje')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.biganjeRocnoZgibanje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Biganje + ročno zgibanje')}`}>
                            Biganje + ročno zgibanje: {formatirajCas(nalog.casSekcije.biganjeRocnoZgibanje)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Biganje + ročno zgibanje')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.zgibanje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Zgibanje') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Zgibanje')}`}>
                            Zgibanje: {formatirajCas(nalog.casSekcije.zgibanje)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Zgibanje')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.lepljenje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Lepljenje')}`}>
                            Lepljenje: {formatirajCas(nalog.casSekcije.lepljenje)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Lepljenje')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.lepljenjeBlokov > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Lepljenje blokov') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Lepljenje blokov')}`}>
                            Lepljenje blokov: {formatirajCas(nalog.casSekcije.lepljenjeBlokov)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Lepljenje blokov')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.vezava > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Vezava') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Vezava')}`}>
                            Vezava: {formatirajCas(nalog.casSekcije.vezava)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Vezava')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.vrtanjeLuknje > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Vrtanje luknje') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Vrtanje luknje')}`}>
                            Vrtanje luknje: {formatirajCas(nalog.casSekcije.vrtanjeLuknje)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Vrtanje luknje')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.perforacija > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Perforacija') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Perforacija')}`}>
                            Perforacija: {formatirajCas(nalog.casSekcije.perforacija)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Perforacija')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                        {nalog.casSekcije.kooperanti > 0 && !isTaskClosed(nalog.stevilkaNaloga, 'Kooperanti') && (
                          <div className={`relative px-2 py-1 rounded text-xs ${getDodelavaBarva('Kooperanti')}`}>
                            Kooperanti: {formatirajCas(nalog.casSekcije.kooperanti)}
                            <button
                              onClick={() => handleCloseTask(nalog.stevilkaNaloga, 'Kooperanti')}
                              className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Akcije */}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="text-xs font-medium">
                        {soVsiOblackiZaprti(nalog) ? (
                          <span className="text-green-600">Nalog zaključen</span>
                        ) : (
                          <span className="text-green-600">V delu</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button 
                          className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 transition-colors text-xs"
                          onClick={() => handleResetNalog(nalog.stevilkaNaloga)}
                        >
                          Razveljavi
                        </button>
                        <button 
                          className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-xs"
                          onClick={() => {
                            // Najdi originalni nalog iz seznama vseh nalogov
                            const originalniNalog = prioritetniNalogi.find(p => p.stevilkaNaloga === nalog.stevilkaNaloga);
                            if (originalniNalog) {
                              // Pretvori v format, ki ga pričakuje handleIzberiNalog
                              const nalogZaOdprtje = {
                                stevilkaNaloga: originalniNalog.stevilkaNaloga,
                                podatki: originalniNalog.podatki,
                                status: originalniNalog.status,
                                emailPoslan: originalniNalog.podatki?.emailPoslan || false,
                                dobavljeno: originalniNalog.status === 'dobavljeno'
                              };
                              onIzberi(nalogZaOdprtje);
                            }
                          }}
                        >
                          Odpri
                        </button>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Obremenitev storitev */}
          <div className="w-80 bg-gray-50 border-l flex flex-col">
            <div className="p-4 border-b bg-white">
              <h3 className="text-lg font-bold text-gray-800">Obremenitev Storitev</h3>
              <p className="text-sm text-gray-600">Skupni čas po storitvah</p>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {obremenitevStoritev.map((storitev) => (
                <div key={storitev.naziv} className={`rounded-lg p-3 border ${getDodelavaBarva(storitev.naziv)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{storitev.naziv}</h4>
                    <span className="text-sm font-bold">{formatirajCas(storitev.skupniCas)}</span>
                  </div>
                  <div className="space-y-1">
                    {storitev.nalogi.map((nalog) => (
                      <div key={nalog.stevilkaNaloga} className="flex items-center justify-between text-xs">
                        <span>#{nalog.stevilkaNaloga}</span>
                        <span className="font-medium">{formatirajCas(nalog.cas)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PrioritetniNalogi; 