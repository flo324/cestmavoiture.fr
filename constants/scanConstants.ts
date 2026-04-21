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

/** Image CT depuis le scan global : ne pas passer file:// dans l’URL (troncature / encodage). */
export const STORAGE_PENDING_CT_FROM_SCAN = '@otto_pending_ct_image_uri_v1';

export const STORAGE_PENDING_PERMIS_FROM_SCAN = '@otto_pending_permis_image_uri_v1';
export const STORAGE_PENDING_CG_FROM_SCAN = '@otto_pending_cg_image_uri_v1';
export const STORAGE_SCAN_FORCED_TARGET = '@otto_scan_forced_target_v1';
export const STORAGE_SCAN_FLOW_LOCK = '@otto_scan_flow_lock_v1';

/** Session caméra / scanner : si l’app Android est recyclée, on récupère le résultat via ImagePicker.getPendingResultAsync. */
export const STORAGE_SCAN_CAMERA_SESSION = '@otto_scan_camera_session_v1';
/** Timestamp associé à la session caméra pour éviter les redirections scan sur session périmée. */
export const STORAGE_SCAN_CAMERA_SESSION_AT = '@otto_scan_camera_session_at_v1';
