import './globals.css';
export const metadata = {title:'Sonho em Camadas · Gestão',description:'Sistema de gestão da Sonho em Camadas 3D.',icons:{icon:'brand/Logo_Otimizada_Preta.png'}};
export const viewport = {width:'device-width',initialScale:1,themeColor:'#123b3c'};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="pt-BR"><body>{children}</body></html>}

