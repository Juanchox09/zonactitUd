import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

const base: P = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconoQr = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
  </svg>
);

export const IconoTeclado = (p: P) => (
  <svg {...base} {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2.5" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12.5h.01M10 12.5h.01M14 12.5h.01M18 12.5h.01M8 16h8" />
  </svg>
);

export const IconoImagen = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2.5" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

export const IconoCheck = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconoX = (p: P) => (
  <svg {...base} {...p}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconoPregunta = (p: P) => (
  <svg {...base} {...p}>
    <path d="M9 9a3 3 0 1 1 4.2 2.75c-.75.33-1.2 1.07-1.2 1.9V14M12 18h.01" />
  </svg>
);

export const IconoAlerta = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 8v5M12 16.5h.01" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
  </svg>
);

export const IconoReintentar = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5" />
  </svg>
);

export const IconoVolumen = (p: P) => (
  <svg {...base} {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </svg>
);

export const IconoSilencio = (p: P) => (
  <svg {...base} {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5zM22 9l-6 6M16 9l6 6" />
  </svg>
);

export const IconoReloj = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const IconoEscudo = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const IconoBirrete = (p: P) => (
  <svg {...base} {...p}>
    <path d="m2 9 10-5 10 5-10 5L2 9z" />
    <path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v6" />
  </svg>
);

export const IconoUbicacion = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12 21s-7-6.1-7-11.5a7 7 0 0 1 14 0C19 14.9 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </svg>
);

export const IconoCalendario = (p: P) => (
  <svg {...base} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const IconoFlecha = (p: P) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const IconoBorrar = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m15 9-6 6M9 9l6 6" />
  </svg>
);
