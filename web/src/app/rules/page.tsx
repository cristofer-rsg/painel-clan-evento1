import PublicNavigation from "@/components/public-navigation";

export const metadata = { title: "Regras da pontuação | Ghost Hunt" };

const categories = [
  { icon: "⚔️", title: "Guerras normais", weight: "200 pontos", target: "200 pontos brutos", note: "A pontuação bruta é formada por: participação na guerra (+5, ao realizar pelo menos um ataque); realizar os dois ataques (+10); acertar cada espelho (+5 por ataque); e bônus de estrelas em cada ataque (+1 por 1 estrela, +2 por 2 estrelas ou +3 por 3 estrelas). Os pontos brutos são convertidos proporcionalmente até o máximo de 200 pontos no ranking." },
  { icon: "🏆", title: "Liga dos Clãs", weight: "200 pontos", target: "140 pontos brutos", note: "Cada ataque realizado vale +5 pontos; as estrelas de cada ataque concedem bônus de +1, +2 ou +3; e acertar o espelho vale +5 por ataque. Quem completa os 7 ataques da Liga recebe um bônus único de +10 pontos. A soma é convertida proporcionalmente até o máximo de 200 pontos no ranking." },
  { icon: "🛡️", title: "Raide de Fim de Semana", weight: "150 pontos", target: "32 pontos brutos", note: "Em cada fim de semana, o jogador recebe +5 pontos brutos ao utilizar 5 ou mais ataques. O bônus é automático, é concedido uma única vez por jogador em cada fim de semana e respeita o limite automático de 20 pontos brutos por mês. A pontuação bruta é convertida proporcionalmente para até 150 pontos no ranking." },
  { icon: "🤝", title: "Doações de tropas", weight: "150 pontos", target: "10.000 tropas", note: "A sincronização considera a quantidade de tropas efetivamente doadas pelo jogador durante o mês. Doações recebidas não contam. A pontuação cresce proporcionalmente ao total doado até atingir 10.000 tropas, que correspondem ao máximo de 150 pontos no ranking." },
  { icon: "🎮", title: "Jogos do Clã", weight: "100 pontos", target: "10.000 pontos pessoais", note: "É considerada a pontuação pessoal obtida pelo jogador nos Jogos do Clã durante o mês, sincronizada pelo progresso individual da conquista Games Champion. A pontuação cresce proporcionalmente até 10.000 pontos pessoais, que correspondem ao máximo de 100 pontos no ranking." },
  { icon: "🏰", title: "Ouro doado à Capital", weight: "200 pontos", target: "250.000 de ouro doado", note: "Conta somente o aumento nas contribuições de ouro feitas pelo jogador à Capital do Clã. O ouro recebido, saqueado ou conquistado nos raides não conta como doação. A pontuação cresce proporcionalmente até 250.000 moedas doadas, que correspondem ao máximo de 200 pontos no ranking." },
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
        <article className="rules-card">
          <div className="rules-card-heading"><span className="rules-icon">⚔️</span><div><h2>Guerras normais</h2><p>Objetivo: Participar das guerras e realizar os ataques.</p></div></div>
          <div className="rules-points"><div className="rules-point-row"><span>Máximo no ranking</span><b>200 pontos</b></div></div>
          <div className="rules-table"><div className="rules-table-head"><span>Ação (Objetivo)</span><b>Pontos</b></div><div className="rules-point-row"><span>Participar da guerra</span><b>+5</b></div><div className="rules-point-row"><span>Realizar os dois ataques</span><b>+10</b></div><div className="rules-point-row"><span>Acertar o espelho (por ataque)</span><b>+5</b></div><div className="rules-subrow">Bônus por estrelas (por ataque)</div><div className="rules-point-row"><span>• 1 estrela</span><b>+1</b></div><div className="rules-point-row"><span>• 2 estrelas</span><b>+2</b></div><div className="rules-point-row"><span>• 3 estrelas</span><b>+3</b></div></div>
          <div className="rules-table rules-penalties"><div className="rules-table-head"><span>Penalidades</span><b>Pontos</b></div><div className="rules-point-row"><span>Não realizar nenhum ataque</span><b>−10</b></div><div className="rules-point-row"><span>Realizar apenas um ataque</span><b>−5</b></div><div className="rules-point-row"><span>Realizar o segundo ataque antes das 12 horas finais</span><b>−5</b></div><div className="rules-point-row"><span>Primeiro ataque fora do espelho antes das 12 horas finais</span><b>−5</b></div></div>
          <div className="rules-timing"><b>◷ Regra dos ataques</b><p>Antes das 12 horas finais, o primeiro ataque deve respeitar o espelho. O segundo ataque pode ser feito fora do espelho quando faltarem 12 horas ou menos. Se o jogador não tiver realizado nenhum ataque antes desse período, poderá fazer os dois ataques fora do espelho nas 12 horas finais.</p></div>
        </article>
        <article className="rules-card">
          <div className="rules-card-heading"><span className="rules-icon">🏆</span><div><h2>Liga dos Clãs</h2><p>Objetivo: Realizar os 7 ataques da Liga.</p></div></div>
          <div className="rules-points"><div className="rules-point-row"><span>Máximo no ranking</span><b>200 pontos</b></div></div>
          <div className="rules-table"><div className="rules-table-head"><span>Ação (Objetivo)</span><b>Pontos</b></div><div className="rules-point-row"><span>Realizar um ataque</span><b>+5</b></div><div className="rules-point-row"><span>Acertar o espelho (por ataque)</span><b>+5</b></div><div className="rules-subrow">Bônus por estrelas (por ataque)</div><div className="rules-point-row"><span>• 1 estrela</span><b>+1</b></div><div className="rules-point-row"><span>• 2 estrelas</span><b>+2</b></div><div className="rules-point-row"><span>• 3 estrelas</span><b>+3</b></div><div className="rules-point-row"><span>Concluir os 7 ataques da Liga</span><b>+10</b></div></div>
          <div className="rules-table rules-penalties"><div className="rules-table-head"><span>Penalidades</span><b>Pontos</b></div><div className="rules-point-row"><span>Não realizar o ataque do dia</span><b>−5</b></div><div className="rules-point-row"><span>Atacar fora do espelho</span><b>−5</b></div></div>
          <p className="rules-note">A penalidade por ataque diário não realizado é aplicada após o encerramento daquela guerra da Liga.</p>
        </article>
        {categories.slice(2).map((category) => <article className="rules-card" key={category.title}><div className="rules-card-heading"><span className="rules-icon">{category.icon}</span><div><h2>{category.title}</h2><p>Objetivo: {category.target}</p></div></div><div className="rules-points"><div className="rules-point-row"><span>Máximo no ranking</span><b>{category.weight}</b></div></div><p className="rules-note">{category.note}</p></article>)}
      </div>

      <section className="rules-card rules-final">
        <div className="rules-card-heading"><span className="rules-icon">⚔️</span><div><h2>Regras obrigatórias das guerras</h2><p>Prazo dos ataques e regra do espelho</p></div></div>
        <div className="rules-points">
          <div className="rules-point-row"><span>Primeiro ataque antes das 12 horas finais</span><b>Deve respeitar o espelho</b></div>
          <div className="rules-point-row"><span>Segundo ataque</span><b>Liberado nas últimas 12 horas, inclusive fora do espelho</b></div>
          <div className="rules-point-row"><span>Dois ataques guardados</span><b>Podem ser feitos fora do espelho nas últimas 12 horas</b></div>
          <div className="rules-point-row"><span>Primeiro ataque fora do espelho antes das 12 horas finais</span><b>−5 pontos</b></div>
          <div className="rules-point-row"><span>Não realizar nenhum ataque</span><b>−10 pontos</b></div>
          <div className="rules-point-row"><span>Realizar apenas um ataque</span><b>−5 pontos</b></div>
          <div className="rules-point-row"><span>Pontuação final</span><b>Pode ficar negativa</b></div>
        </div>
        <p className="rules-note">A ausência dos dois ataques gera penalidade de −10 pontos e a realização de apenas um ataque gera penalidade de −5 pontos. A exigência do espelho vale somente para o primeiro ataque realizado antes das 12 horas finais. O segundo ataque pode ser feito em qualquer alvo quando faltarem 12 horas ou menos. Se o jogador guardar os dois ataques, poderá realizar ambos fora do espelho nesse período. A penalidade de −5 por sair do espelho aplica-se somente ao primeiro ataque feito antes das 12 horas finais. O segundo ataque realizado antes desse período continua sujeito à penalidade de horário.</p>
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
