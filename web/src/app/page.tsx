const applications = [
  { name: "GHOST HUNT", eyebrow: "CLAN COMMUNITY", description: "Ranking, guerras, raides, desempenho e administração do clã.", href: "/ranking", tone: "green", image: "/ghost-hunt.webp", imageAlt: "Arte oficial do Ghost Hunt com Rei Bárbaro, Rainha Arqueira e o castelo", features: ["Ranking e pódio", "Guerras e raides", "Desempenho dos jogadores"] },
  { name: "INGLORIOUS", eyebrow: "CLAN MANAGEMENT", description: "Acompanhe os membros, a pontuação, as atividades e a evolução do clã.", href: "https://inglorious-six.vercel.app", tone: "violet", image: "/inglorious.webp", imageAlt: "Arte do clã Inglorious com Mago e P.E.K.K.A.", features: ["Gestão de membros", "Pontuação e estatísticas", "Histórico e atividades"] },
];
export default function PortalHomePage() {
  return <main className="portal-page">
    <div className="portal-orb portal-orb-one" aria-hidden="true"/><div className="portal-orb portal-orb-two" aria-hidden="true"/>
    <header className="portal-header"><a className="portal-brand" href="/" aria-label="Ghost Hunt Portal"><span className="portal-brand-mark">GH</span><span><strong>GHOST HUNT</strong><small>GAMING PLATFORM</small></span></a><span className="portal-header-label"><i/> CENTRAL DE APLICATIVOS</span></header>
    <section className="portal-intro"><span className="portal-kicker">DUAS EXPERIÊNCIAS. UM SÓ PORTAL.</span><h1>ESCOLHA SUA<br/><em>PLATAFORMA</em></h1><p>Acesse seu ambiente de jogo e acompanhe tudo o que acontece no seu clã.</p></section>
    <section className="portal-app-grid" aria-label="Aplicativos disponíveis">{applications.map(app=><article className={`portal-app-card ${app.tone}`} key={app.name}>
      <div className="portal-card-art" aria-hidden="true"><img src={app.image} alt="" /></div>
      <div className="portal-card-overlay" aria-hidden="true" />
      <div className="portal-card-topline"><span>{app.eyebrow}</span><span className="portal-card-status"><i/> DISPONÍVEL</span></div>
      <div className="portal-card-copy"><h2>{app.name}</h2><p>{app.description}</p></div>
      <ul className="portal-feature-list">{app.features.map(feature=><li key={feature}><span>✦</span>{feature}</li>)}</ul>
      <a className="portal-enter-button" href={app.href} target={app.href.startsWith("http")?"_blank":undefined} rel={app.href.startsWith("http")?"noopener noreferrer":undefined}><span>ACESSAR {app.name}</span><b aria-hidden="true">↗</b></a>
    </article>)}</section>
    <footer className="portal-footer"><span>GHOST HUNT <b>•</b> CENTRAL GAMING</span><span>Selecione um aplicativo para continuar</span></footer>
  </main>;
}