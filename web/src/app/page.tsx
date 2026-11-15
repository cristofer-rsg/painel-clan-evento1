import Link from "next/link";

const applications = [
  { name: "GHOST HUNT", eyebrow: "CLAN COMMUNITY", description: "Ranking, guerras, raides, desempenho e administração do clã.", href: "/ghosthunt", tone: "green", features: ["Ranking e pódio", "Guerras e raides", "Desempenho dos jogadores"] },
  { name: "INGLORIOUS", eyebrow: "CLAN MANAGEMENT", description: "Ranking, guerras, raides, desempenho e administração do clã.", href: "/inglorious", tone: "violet", features: ["Ranking e pódio", "Guerras e raides", "Desempenho dos jogadores"] },
];
export default function PortalHomePage() {
  return <main className="portal-page">
    <div className="portal-orb portal-orb-one" aria-hidden="true"/><div className="portal-orb portal-orb-two" aria-hidden="true"/>
    <header className="portal-header"><a className="portal-brand" href="/" aria-label="Ghost Hunt Portal"><span className="portal-brand-mark">GH</span><span><strong>GHOST HUNT</strong><small>GAMING PLATFORM</small></span></a><span className="portal-header-label"><i/> CENTRAL DE APLICATIVOS</span></header>
    <section className="portal-intro"><span className="portal-kicker">DUAS EXPERIÊNCIAS. UM SÓ PORTAL.</span><h1 className="portal-title"><span>ESCOLHA O SEU</span><em>CLÃ</em></h1><p>Acesse seu ambiente de jogo e acompanhe tudo o que acontece no seu clã.</p></section>
    <section className="portal-app-grid" aria-label="Aplicativos disponíveis">{applications.map(app=><article className={`portal-app-card ${app.tone}`} key={app.name}>
      <div className="portal-card-overlay" aria-hidden="true" />
      <div className="portal-card-topline"><span>{app.eyebrow}</span><span className="portal-card-status"><i/> DISPONÍVEL</span></div>
      <div className="portal-card-copy"><h2>{app.name}</h2><p>{app.description}</p></div>
      <ul className="portal-feature-list">{app.features.map(feature=><li key={feature}><span>✦</span>{feature}</li>)}</ul>
      <Link className="portal-enter-button" href={app.href} prefetch={false}><span>ACESSAR {app.name}</span><b aria-hidden="true">↗</b></Link>
    </article>)}</section>
    <footer className="portal-footer"><span>GHOST HUNT <b>•</b> CENTRAL GAMING</span><span>Selecione um aplicativo para continuar</span></footer>
  </main>;
}
