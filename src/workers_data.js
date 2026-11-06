/**
 * Horizon Recognition Program — fictitious workers directory.
 *
 * WORKERS_SEED is the default directory (30 fictitious records). An admin can
 * replace it by uploading a spreadsheet; the replacement is stored in
 * localStorage under "hr_workers_updated" and takes precedence over the seed.
 * All names, IDs and e-mails are invented. The ".example" domain is reserved
 * for documentation and never resolves to a real company.
 */
(function (root) {
  'use strict';

  const WORKERS_SEED = [
    { id: '10000001', name: 'Ana Beatriz Moura', area: 'R&D Division', location: 'Campinas', cl: 'CL4', email: 'ana.moura@horizon.example' },
    { id: '10000002', name: 'Bruno Tavares Lins', area: 'R&D Division', location: 'Campinas', cl: 'CL3', email: 'bruno.lins@horizon.example' },
    { id: '10000003', name: 'Carla Duarte Penha', area: 'Marketing', location: 'São Paulo', cl: 'CL3', email: 'carla.penha@horizon.example' },
    { id: '10000004', name: 'Diego Fontana Reis', area: 'Finance', location: 'São Paulo', cl: 'CL5', email: 'diego.reis@horizon.example' },
    { id: '10000005', name: 'Elisa Campos Nery', area: 'People & Culture', location: 'Campinas', cl: 'CL4', email: 'elisa.nery@horizon.example' },
    { id: '10000006', name: 'Felipe Arantes Sá', area: 'Operations', location: 'Manaus', cl: 'CL2', email: 'felipe.sa@horizon.example' },
    { id: '10000007', name: 'Gabriela Torres Lume', area: 'IT & Digital', location: 'Remote', cl: 'CL3', email: 'gabriela.lume@horizon.example' },
    { id: '10000008', name: 'Heitor Brandão Vale', area: 'Sales', location: 'Recife', cl: 'CL3', email: 'heitor.vale@horizon.example' },
    { id: '10000009', name: 'Isadora Quintela Rocha', area: 'Legal', location: 'São Paulo', cl: 'CL4', email: 'isadora.rocha@horizon.example' },
    { id: '10000010', name: 'João Pedro Albuquerque', area: 'Supply Chain', location: 'Manaus', cl: 'CL3', email: 'joao.albuquerque@horizon.example' },
    { id: '10000011', name: 'Karina Moraes Teles', area: 'Design', location: 'Campinas', cl: 'CL2', email: 'karina.teles@horizon.example' },
    { id: '10000012', name: 'Lucas Ventura Prado', area: 'R&D Division', location: 'Recife', cl: 'CL5', email: 'lucas.prado@horizon.example' },
    { id: '10000013', name: 'Marina Esteves Couto', area: 'Customer Experience', location: 'Remote', cl: 'CL2', email: 'marina.couto@horizon.example' },
    { id: '10000014', name: 'Nicolas Barreto Faria', area: 'IT & Digital', location: 'Campinas', cl: 'CL4', email: 'nicolas.faria@horizon.example' },
    { id: '10000015', name: 'Olívia Sampaio Dantas', area: 'Marketing', location: 'São Paulo', cl: 'CL4', email: 'olivia.dantas@horizon.example' },
    { id: '10000016', name: 'Paulo Henrique Viana', area: 'Operations', location: 'Manaus', cl: 'CL5', email: 'paulo.viana@horizon.example' },
    { id: '10000017', name: 'Rafaela Nogueira Leal', area: 'Finance', location: 'Campinas', cl: 'CL2', email: 'rafaela.leal@horizon.example' },
    { id: '10000018', name: 'Samuel Coutinho Braga', area: 'Sales', location: 'São Paulo', cl: 'CL4', email: 'samuel.braga@horizon.example' },
    { id: '10000019', name: 'Tatiana Rezende Melo', area: 'People & Culture', location: 'Recife', cl: 'CL3', email: 'tatiana.melo@horizon.example' },
    { id: '10000020', name: 'Ulisses Pacheco Lobo', area: 'Supply Chain', location: 'Campinas', cl: 'CL2', email: 'ulisses.lobo@horizon.example' },
    { id: '10000021', name: 'Vitória Assis Calado', area: 'R&D Division', location: 'Campinas', cl: 'CL3', email: 'vitoria.calado@horizon.example' },
    { id: '10000022', name: 'Wagner Siqueira Bento', area: 'IT & Digital', location: 'Remote', cl: 'CL5', email: 'wagner.bento@horizon.example' },
    { id: '10000023', name: 'Yasmin Ferraz Godoy', area: 'Design', location: 'São Paulo', cl: 'CL3', email: 'yasmin.godoy@horizon.example' },
    { id: '10000024', name: 'Zeca Monteiro Aguiar', area: 'Customer Experience', location: 'Recife', cl: 'CL4', email: 'zeca.aguiar@horizon.example' },
    { id: '10000025', name: 'Amanda Ribas Cordeiro', area: 'Legal', location: 'Campinas', cl: 'CL2', email: 'amanda.cordeiro@horizon.example' },
    { id: '10000026', name: 'Caio Martins Furtado', area: 'Operations', location: 'Manaus', cl: 'CL3', email: 'caio.furtado@horizon.example' },
    { id: '10000027', name: 'Débora Lacerda Pinto', area: 'Marketing', location: 'Remote', cl: 'CL5', email: 'debora.pinto@horizon.example' },
    { id: '10000028', name: 'Eduardo Salles Mota', area: 'Finance', location: 'São Paulo', cl: 'CL3', email: 'eduardo.mota@horizon.example' },
    { id: '10000029', name: 'Fernanda Guedes Luz', area: 'R&D Division', location: 'Recife', cl: 'CL4', email: 'fernanda.luz@horizon.example' },
    { id: '10000030', name: 'Gustavo Peixoto Amaral', area: 'Sales', location: 'Manaus', cl: 'CL2', email: 'gustavo.amaral@horizon.example' }
  ];

  const OVERRIDE_KEY = 'hr_workers_updated';

  function readOverride() {
    try {
      const raw = root.localStorage ? root.localStorage.getItem(OVERRIDE_KEY) : null;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Stored shape: { updatedAt, source, workers: [...] }
      if (parsed && Array.isArray(parsed.workers) && parsed.workers.length) return parsed;
    } catch (e) {
      /* corrupted override -> ignore and use the seed */
    }
    return null;
  }

  const HorizonWorkers = {
    seed: WORKERS_SEED,

    /** Active directory: admin override if present, otherwise the seed. */
    getAll() {
      const override = readOverride();
      return override ? override.workers : WORKERS_SEED;
    },

    findById(id) {
      const key = String(id || '').trim();
      if (!key) return null;
      return this.getAll().find((w) => w.id === key) || null;
    },

    /** Info about the active source, used by the admin panel. */
    getSourceInfo() {
      const override = readOverride();
      if (!override) return { isOverride: false, count: WORKERS_SEED.length, updatedAt: null, source: null };
      return { isOverride: true, count: override.workers.length, updatedAt: override.updatedAt || null, source: override.source || null };
    },

    replace(workers, source) {
      const payload = { updatedAt: new Date().toISOString(), source: source || null, workers };
      root.localStorage.setItem(OVERRIDE_KEY, JSON.stringify(payload));
      return payload;
    },

    reset() {
      root.localStorage.removeItem(OVERRIDE_KEY);
    }
  };

  if (typeof module === 'object' && module.exports) {
    module.exports = { WORKERS_SEED, HorizonWorkers };
  } else {
    root.WORKERS_SEED = WORKERS_SEED;
    root.HorizonWorkers = HorizonWorkers;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
