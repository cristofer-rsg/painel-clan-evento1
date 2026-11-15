const applications = [
  { name: "GHOST HUNT", description: "Ranking, guerras, raides, desempenho e administração do clã.", href: "/ghosthunt", tone: "green", image: "https://d2jqrm6oza8nb6.cloudfront.net/datasets/bf37a79e-28bf-4083-a24f-de224fdf7813.webp?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiNjMyN2Q2NjgwNmQwZTgzYyIsImJ1Y2tldCI6InJ1bndheS1kYXRhc2V0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc5NDg4MzE3Nn0.4dOW9qf5SYuD2BBhvhfQVjtxVHBGqckfswIklfdAYNE", features: ["Ranking e pódio", "Guerras e raides", "Desempenho dos jogadores"] },
  { name: "INGLORIOUS", description: "Ranking, guerras, raides, desempenho e administração do clã.", href: "/inglorious", tone: "violet", image: "https://d2jqrm6oza8nb6.cloudfront.net/datasets/38fa9a8f-0896-4ff8-91b4-5ddfbbc3bf50.webp?_jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXlIYXNoIjoiMjNjZDZjYzY1Zjk5N2Q1NyIsImJ1Y2tldCI6InJ1bndheS1kYXRhc2V0cyIsInN0YWdlIjoicHJvZCIsImV4cCI6MTc5NDg4NjA4Nn0.xYwS00mGJ3e3TRYKbxXP4hC85Fvb2KyvfDWUZWhPFWs", features: ["Ranking e pódio", "Guerras e raides", "Desempenho dos jogadores"] },
];
export default function PortalHomePage() {
  return <main className="portal-page">
    <div className="portal-orb portal-orb-one" aria-hidden="true"/><div className="portal-orb portal-orb-two" aria-hidden="true"/>
    <header className="portal-header"><a className="portal-brand" href="/" aria-label="Ghost Hunt Portal"><span className="portal-brand-mark">GH</span><span><strong>GHOST HUNT</strong><small>GAMING PLATFORM</small></span></a><span className="portal-header-label"><i/> CENTRAL DE APLICATIVOS</span></header>
    <section className="portal-intro"><span className="portal-kicker">DUAS EXPERIÊNCIAS. UM SÓ PORTAL.</span><h1 className="portal-title"><span>ESCOLHA O SEU</span><em>CLÃ</em></h1><p>Acesse seu ambiente de jogo e acompanhe tudo o que acontece no seu clã.</p></section>
    <section className="portal-app-grid" aria-label="Aplicativos disponíveis">{applications.map(app=><article className={`portal-app-card ${app.tone}`} key={app.name}>
      <div className="portal-card-art" aria-hidden="true"><img src={app.image} alt="" /></div><div className="portal-card-overlay" aria-hidden="true" />
      <div className="portal-card-topline"><span className="portal-card-status"><i/> DISPONÍVEL</span></div>
      
      <ul className="portal-feature-list">{app.features.map(feature=><li key={feature}><span>✦</span>{feature}</li>)}</ul>
      <a className="portal-enter-button" href={app.href} target={app.href.startsWith("http")?"_blank":undefined} rel={app.href.startsWith("http")?"noopener noreferrer":undefined}><span>ACESSAR {app.name}</span><b aria-hidden="true">↗</b></a>
    </article>)}</section>
    <footer className="portal-footer"><span>GHOST HUNT <b>•</b> CENTRAL GAMING</span><span>Selecione um aplicativo para continuar</span></footer>
  </main>;
}