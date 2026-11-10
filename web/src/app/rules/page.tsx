import PublicNavigation from "@/components/public-navigation";

export const metadata = { title: "Regras da pontuação | Ghost Hunt" };

const categories = [
  { icon: "⚔️", title: "Guerras normais", weight: "200 pontos", target: "20 pontos brutos", note: "Os pontos válidos registrados nas guerras são somados até atingir a meta de 20 pontos brutos. O limite desta categoria é 200 pontos no ranking." },
  { icon: "🏆", title: "Liga dos Clãs", weight: "200 pontos", target: "140 pontos brutos", note: "Os pontos dos ataques e o bônus de conclusão dos 7 ataques são contabilizados. A categoria tem limite de 200 pontos no mês." },
  { icon: "🛡️", title: "Raide de Fim de Semana", weight: "150 pontos", target: "16 pontos brutos", note: "São considerados os pontos registrados pelos ataques utilizados nos raides. A categoria tem limite mensal de 150 pontos." },
  { icon: "🤝", title: "Doações de tropas", weight: "150 pontos", target: "10.000 tropas", note: "Conta somente a quantidade de tropas efetivamente doadas pelo jogador durante o mês. Doar 10.000 tropas atinge o limite de 150 pontos." },
  { icon: "🎮", title: "Jogos do Clã", weight: "100 pontos", target: "10.000 pontos pessoais", note: "Conta a pontuação individual registrada nos Jogos do Clã. Ao atingir 10.000 pontos, o jogador recebe os 100 pontos da categoria." },
  { icon: "🏰", title: "Ouro doado à Capital", weight: "200 pontos", target: "250.000 de ouro doado", note: "Conta somente o ouro efetivamente doado pelo jogador à Capital. Ouro recebido ou conquistado nos raides não entra nessa contagem." },
];

export default function RulesPage() {
  return <main className="admin-shell">
    <header className="admin-header">
      <a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN COMMUNITY</small></span></a>
      <a className="back-link" href="/">← Início</a>
    </header>
    <PublicNavigation />
    <section className="admin-content rules-content">
      <span className="auth-kicker">REGULAMENTO OFICIAL • NOVA PONTUAÇÃO</span>
      <h1>Regras <em>dos pontos</em></h1>
      <p>O ranking mensal soma pontos de seis atividades. A referência é de 1.000 pontos por mês, e cada categoria tem sua própria meta e limite.</p>

      <article className="rules-highlight">
        <span>📊</span><div><b>Como funciona a pontuação</b><p>Os pontos de cada atividade são calculados proporcionalmente à meta, arredondados para números inteiros e somados. A pontuação de cada categoria não ultrapassa seu limite.</p></div>
      </article>

      <div className="rules-grid">
        {categories.map((category) => <article className="rules-card" key={category.title}>
          <div className="rules-card-heading"><span className="rules-icon">{category.icon}</span><div><h2>{category.title}</h2><p>Meta: {category.target}</p></div></div>
          <div className="rules-points"><div className="rules-point-row"><span>Máximo no ranking</span><b>{category.weight}</b></div></div>
          <p className="rules-note">{category.note}</p>
        </article>)}
      </div>

      <section className="rules-card rules-final">
        <div className="rules-card-heading"><span className="rules-icon">⚔️</span><div><h2>Regras obrigatórias das guerras</h2><p>Prazo dos ataques e única penalidade</p></div></div>
        <div className="rules-points">
          <div className="rules-point-row"><span>Primeiro ataque</span><b>Respeitar o espelho definido</b></div>
          <div className="rules-point-row"><span>Segundo ataque</span><b>Até 12 horas antes do fim da guerra</b></div>
          <div className="rules-point-row"><span>Atacar fora do espelho sem autorização</span><b>−50 pontos</b></div>
          <div className="rules-point-row"><span>Deixar de realizar ataques</span><b>Sem multa adicional</b></div>
          <div className="rules-point-row"><span>Pontuação final</span><b>Nunca fica abaixo de zero</b></div>
        </div>
        <p className="rules-note">Deixar de realizar um ou os dois ataques não gera desconto. O jogador apenas deixa de receber os pontos correspondentes. Atacar fora do espelho sem autorização é a única infração com desconto de pontos. Não há penalidades duplicadas.</p>
      </section>

      <section className="rules-card rules-final">
        <div className="rules-card-heading"><span className="rules-icon">📈</span><div><h2>Ranking e desempenho</h2><p>Entenda a diferença entre os dois indicadores</p></div></div>
        <div className="rules-points">
          <div className="rules-point-row"><span>Ranking mensal</span><b>Mostra somente os pontos acumulados</b></div>
          <div className="rules-point-row"><span>Desempenho geral</span><b>Mostra somente a porcentagem</b></div>
          <div className="rules-point-row"><span>Detalhamento por atividade</span><b>Mostra pontos e percentual</b></div>
          <div className="rules-point-row"><span>Referência geral</span><b>1.000 pontos = 100%</b></div>
        </div>
        <p className="rules-note">A porcentagem geral corresponde à pontuação líquida dividida por 10. Exemplo: 790 pontos representam 79% de desempenho.</p>
      </section>

      <section className="rules-card rules-final">
        <div className="rules-card-heading"><span className="rules-icon">🏆</span><div><h2>Premiação mensal</h2><p>Critérios de participação na campanha de premiação</p></div></div>
        <div className="rules-points">
          <div className="rules-point-row"><span>Vencedor do mês</span><b>Fica fora das duas premiações seguintes</b></div>
          <div className="rules-point-row"><span>Líder e co-líderes</span><b>Não são elegíveis aos prêmios</b></div>
        </div>
        <p className="rules-note">A classificação considera os pontos válidos do mês e os critérios de elegibilidade cadastrados. Em caso de dúvida sobre um lançamento, consulte a aba Histórico.</p>
      </section>
      <a className="back-link" href="/performance">← Ver desempenho dos jogadores</a>
    </section>
  </main>;
}
