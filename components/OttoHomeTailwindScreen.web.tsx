import React from 'react';

/**
 * Maquette OTTO (web uniquement) — classes Tailwind, fidèle à la capture fournie.
 * Prévisualisation : route `app/otto-design.web.tsx` ou `npx expo start --web`.
 */
export type OttoHomeTailwindScreenProps = {
  /** Affichage kilométrage (ex. "12,345 KM") */
  odometerLabel?: string;
  /** Position du curseur « T » sur la jauge (0–100). */
  healthCursorPercent?: number;
  /** Texte sous la jauge (entretien). */
  entretienLine?: string;
  /** URL de l’image véhicule (Peugeot 208 grise par défaut — Wikimedia). */
  vehicleImageSrc?: string;
  onScanPress?: () => void;
  onProfilePress?: () => void;
};

const DEFAULT_VEHICLE_IMAGE =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Peugeot_208_2020_IMG_5039.jpg/1280px-Peugeot_208_2020_IMG_5039.jpg';

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M4 7.5A2.5 2.5 0 016.5 5h2.05l1.02-1.53A1.5 1.5 0 0110.88 2h2.24c.56 0 1.08.3 1.36.79L15.45 5H17.5A2.5 2.5 0 0120 7.5v9A2.5 2.5 0 0117.5 19h-11A2.5 2.5 0 014 16.5v-9z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.25" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function UserIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 1114 0H5z" />
    </svg>
  );
}

export function OttoHomeTailwindScreen({
  odometerLabel = '12,345 KM',
  healthCursorPercent = 58,
  entretienLine = 'PROCHAIN ENTRETIEN : 2 500 KM (VIDANGE)',
  vehicleImageSrc = DEFAULT_VEHICLE_IMAGE,
  onScanPress,
  onProfilePress,
}: OttoHomeTailwindScreenProps) {
  const cursorPct = Math.min(100, Math.max(0, healthCursorPercent));

  return (
    <div className="relative min-h-[100dvh] w-full overflow-hidden bg-gradient-to-b from-[#0a1628] via-[#050a12] to-black font-sans text-slate-900 antialiased">
      {/* Fond : halos bleus discrets */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(56, 189, 248, 0.25), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(30, 58, 138, 0.2), transparent 50%)',
        }}
      />

      {/* Header */}
      <header className="relative z-10 flex items-start justify-between px-6 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <h1 className="select-none text-3xl font-light tracking-[0.2em] text-sky-300 drop-shadow-[0_0_24px_rgba(125,211,252,0.35)]">
          OTTO
        </h1>
        <button
          type="button"
          onClick={onProfilePress}
          className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-200 to-slate-400 text-slate-800 shadow-lg ring-2 ring-white/10 transition hover:brightness-110 active:scale-95"
          aria-label="Profil"
        >
          <UserIcon className="h-6 w-6" />
          <span className="absolute -bottom-0.5 -right-0.5 rounded bg-black px-1.5 py-0.5 text-[9px] font-bold leading-none tracking-wide text-white">
            PRO
          </span>
        </button>
      </header>

      {/* Carte centrale */}
      <main className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-40 pt-4">
        <article className="rounded-[1.75rem] bg-white p-5 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
          <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.35em] text-slate-500">
            MA VOITURE
          </p>

          <div className="mb-5 overflow-hidden rounded-2xl bg-slate-100">
            <img
              src={vehicleImageSrc}
              alt="Peugeot 208 grise"
              className="h-auto w-full max-h-[200px] object-cover object-center"
              loading="eager"
              decoding="async"
            />
          </div>

          <div className="mb-1 text-center">
            <p className="text-[2.75rem] font-black leading-none tracking-tight text-slate-900 md:text-5xl">
              {odometerLabel}
            </p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.4em] text-slate-400">
              KILOMÉTRAGE
            </p>
            <p className="mt-1.5 text-xs italic text-slate-400">
              Automatically updated by GPS
            </p>
          </div>

          {/* Jauge santé */}
          <div className="mt-8">
            <div className="relative px-0.5 pt-7">
              {/* Curseur T inversé (barre horizontale + tige vers la barre) */}
              <div
                className="absolute top-0 flex -translate-x-1/2 flex-col items-center"
                style={{ left: `${cursorPct}%` }}
              >
                <div className="h-1 w-9 rounded-sm bg-black shadow-sm" />
                <div className="h-5 w-[3px] rounded-full bg-black" />
              </div>
              <div className="h-3 w-full rounded-full bg-gradient-to-r from-emerald-400 via-amber-300 to-red-500 shadow-inner ring-1 ring-black/10" />
              <div className="mt-1 flex justify-between text-[10px] font-medium text-slate-400">
                <span>Green</span>
                <span>Red</span>
              </div>
            </div>

            <p className="mt-4 text-center text-[11px] font-bold leading-snug text-slate-800">
              {entretienLine}
            </p>
            <p className="mt-3 text-center text-sm font-extrabold uppercase tracking-wide text-slate-900">
              SANTÉ DU VÉHICULE
            </p>
          </div>
        </article>
      </main>

      {/* Zone basse + FAB */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex flex-col items-center pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-[#030712] via-[#030712]/90 to-transparent"
          aria-hidden
        />
        <div className="pointer-events-auto relative flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={onScanPress}
            className="relative flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 via-sky-500 to-blue-700 text-white shadow-otto-fab ring-4 ring-cyan-400/25 transition hover:brightness-110 active:scale-95"
            style={{
              boxShadow:
                '0 0 0 1px rgba(125, 211, 252, 0.4), 0 0 40px rgba(34, 211, 238, 0.6), 0 16px 40px rgba(15, 23, 42, 0.5)',
            }}
            aria-label="Scanner un document"
          >
            <CameraIcon className="h-9 w-9 text-white drop-shadow-md" />
          </button>
          <p className="text-center text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-300/95">
            SCANNER UN DOCUMENT
          </p>
        </div>
      </div>
    </div>
  );
}

export default OttoHomeTailwindScreen;
