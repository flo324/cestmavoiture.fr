/** Cases proposées au scan (KM exclu : pas pertinent pour ce flux) */
export const SCAN_CASES = [
  { id: 1, key: 'entretien', title: "CARNET D'ENTRETIEN", short: 'Entretien', route: '/entretien' as const },
  { id: 2, key: 'documents', title: 'DOCUMENTS DU VÉHICULE', short: 'Documents', route: '/docs' as const },
  { id: 3, key: 'diagnostics', title: 'DIAGNOSTICS & ALERTES', short: 'Diagnostics', route: '/diagnostics' as const },
  { id: 4, key: 'factures', title: 'FRAIS & DÉPENSES', short: 'Dépenses', route: '/factures' as const },
  { id: 5, key: 'ct', title: 'CT', short: 'Contrôle technique', route: '/ct' as const },
] as const;

export const STORAGE_DIAG_SCAN = '@diagnostics_scan_items_v1';
export const STORAGE_KM_MEMOS = '@km_scan_memos_v1';
