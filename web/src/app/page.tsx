const applications = [
  { name: "GHOST HUNT", eyebrow: "CLAN COMMUNITY", description: "Ranking, guerras, raides, desempenho e administração do clã.", href: "/ghosthunt", tone: "green", image: "https://d2jqrm6oza8nb6.cloudfront.net/datasets/5822ef89-c14a-4c7c-8771-8c5ef3d157e9.webp?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiMGViYzRhNDRmMzljY2NmNCIsImJ1Y2tldCI6InJ1bndheS1kYXRhc2V0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc5NDkwNDAwNH0.HyO_epKF2C-59jz7FvS1qviAzy1sOyzTFkDhVfeyTrM", features: ["Ranking e pódio", "Guerras e raides", "Desempenho dos jogadores"] },
  { name: "INGLORIOUS", eyebrow: "CLAN MANAGEMENT", description: "Ranking, guerras, raides, desempenho e administração do clã.", href: "/inglorious", tone: "violet", image: "https://d2jqrm6oza8nb6.cloudfront.net/datasets/cfa0fdc3-68db-4016-8ef1-8ad0336ced51.webp?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiZWJkNDI1ODRjM2M3MzI2ZiIsImJ1Y2tldCI6InJ1bndheS1kYXRhc2V0cyIsImV4cCI6MTc5NDkwNzM5Nn0.SOEfSYFsjQTpgpnX4P-VfIET6-jVk0U31ssfdnMeXOI", features: ["Ranking e pódio", "Guerras e raides", "Desempenho dos jogadores"] },
];
export default function PortalHomePage() {
  return <main className="portal-page">
    <div className="portal-orb portal-orb-one" aria-hidden="true"/><div className="portal-orb portal-orb-two" aria-hidden="true"/>
    <header className="portal-header"><a className="portal-brand" href="/" aria-label="Ghost Hunt Portal"><span className="portal-brand-mark">GH</span><span><strong>GHOST HUNT</strong><small>GAMING PLATFORM</small></span></a><span className="portal-header-label"><i/> CENTRAL DE APLICATIVOS</span></header>
    <section className="portal-intro"><span className="portal-kicker">DUAS EXPERIÊNCIAS. UM SÓ PORTAL.</span><h1 className="portal-title"><span>ESCOLHA O SEU</span><em>CLÃ</em></h1><p>Acesse seu ambiente de jogo e acompanhe tudo o que acontece no seu clã.</p></section>
    <section className="portal-app-grid" aria-label="Aplicativos disponíveis">{applications.map(app=><article className={`portal-app-card ${app.tone}`} key={app.name}>
      <div className="portal-card-art" aria-hidden="true"><img src={app.image} alt="" /></div><div className="portal-card-overlay" aria-hidden="true" />
      <div className="portal-card-topline"><span>{app.eyebrow}</span><span className="portal-card-status"><i/> DISPONÍVEL</span></div>
      <div className="portal-card-copy"><h2>{app.name}</h2><p>{app.description}</p></div>
      <ul className="portal-feature-list">{app.features.map(feature=><li key={feature}><span>✦</span>{feature}</li>)}</ul>
      <a className="portal-enter-button" href={app.href} target={app.href.startsWith("http")?"_blank":undefined} rel={app.href.startsWith("http")?"noopener noreferrer":undefined}><span>ACESSAR {app.name}</span><b aria-hidden="true">↗</b></a>
    </article>)}</section>
    <footer className="portal-footer"><span>GHOST HUNT <b>•</b> CENTRAL GAMING</span><span>Selecione um aplicativo para continuar</span></footer>
  </main>;
}