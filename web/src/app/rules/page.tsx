import PublicNavigation from "@/components/public-navigation";

export const metadata = { title: "Regras da pontuação | Ghost Hunt" };

const rules = [
  {
    icon: "⚔️", title: "Guerras do Clã", subtitle: "Pontuação por desempenho em cada guerra",
    items: [
      ["Participar da guerra", "+5 pontos"],
      ["Realizar os dois ataques", "+10 pontos"],
      ["Acertar o espelho", "+5 pontos por ataque no espelho"],
      ["Conquistar estrelas", "+1, +2 ou +3 pontos por ataque, conforme as estrelas"],
    ],
    note: "Não existe limite máximo de pontos por guerra. Os pontos de participação, ataques, espelho e estrelas são acumulados conforme as ações realizadas."
  },
  {
    icon: "🛡️", title: "Liga dos Clãs", subtitle: "Cada ataque válido pode somar diferentes critérios",
    items: [
      ["Realizar um ataque", "+5 pontos por ataque"],
      ["Conquistar estrelas", "+1, +2 ou +3 pontos, conforme o resultado"],
      ["Acertar o espelho", "+5 pontos por ataque no espelho"],
    ],
    note: "A pontuação é acumulada pelos ataques registrados durante as batalhas da Liga. Não há teto mensal configurado para esta categoria."
  },
  {
    icon: "🤝", title: "Doações de tropas", subtitle: "Conversão das tropas doadas em pontos",
    items: [
      ["A cada 100 tropas doadas", "+1 ponto"],
      ["Limite mensal", "50 pontos por jogador"],
      ["Máximo considerado", "5.000 tropas doadas no cálculo da pontuação"],
    ],
    note: "A contagem é sincronizada com os dados do clã. Registros antigos de doação que não representam tropas efetivamente doadas não entram no cálculo."
  },
  {
    icon: "🎮", title: "Jogos do Clã", subtitle: "Participação nos Jogos do Clã",
    items: [
      ["Pontuação", "Conforme o progresso individual sincronizado"],
      ["Limite mensal", "25 pontos por jogador"],
    ],
    note: "O sistema acompanha a conquista individual dos Jogos do Clã e considera no ranking no máximo 25 pontos por mês."
  },
  {
    icon: "🏰", title: "Raide de Fim de Semana", subtitle: "Pontos pelos ataques utilizados na Capital",
    items: [
      ["Cada ataque utilizado", "+1 ponto"],
      ["Utilizar 5 ou 6 ataques", "+2 pontos de bônus"],
      ["Máximo por fim de semana", "8 pontos (6 ataques + bônus)"],
    ],
    note: "A sincronização considera até 6 ataques. O mesmo fim de semana não gera pontos duplicados; se houver um lançamento manual para o jogador naquele período, ele tem prioridade sobre o automático."
  },
  {
    icon: "🪙", title: "Capital do Clã", subtitle: "Conversão das contribuições em moedas",
    items: [
      ["A cada 2.500 moedas contribuídas", "+1 ponto no cálculo do ranking"],
      ["Referência inicial", "A primeira leitura cria uma base e não gera pontos retroativos"],
    ],
    note: "A sincronização registra somente o aumento positivo desde a última leitura. O total de moedas também aparece nos indicadores de desempenho."
  },
];

export default function RulesPage() {
  return <main className="admin-shell">
    <header className="admin-header">
      <a className="brand" href="/"><span className="brand-mark">GH</span><span className="brand-copy"><strong>GHOST <i>HUNT</i></strong><small>CLAN COMMUNITY</small></span></a>
      <a className="back-link" href="/">← Início</a>
    </header>
    <PublicNavigation />
    <section className="admin-content rules-content">
      <span className="auth-kicker">REGULAMENTO OFICIAL • PONTUAÇÃO</span>
      <h1>Regras <em>dos pontos</em></h1>
      <p>Consulte como cada atividade soma pontos no ranking mensal do Ghost Hunt, quais são os limites por categoria e como as penalidades afetam o resultado.</p>

      <article className="rules-highlight">
        <span>⚖️</span><div><b>Importante sobre as guerras</b><p>As guerras não têm limite de pontuação. Todos os pontos válidos são somados, inclusive estrelas e bônus por espelho.</p></div>
      </article>

      <div className="rules-grid">
        {rules.map((rule, index) => <article className="rules-card" key={rule.title}>
          <div className="rules-card-heading"><span className="rules-icon">{rule.icon}</span><div><h2>{rule.title}</h2><p>{rule.subtitle}</p></div></div>
          <div className="rules-points">{rule.items.map(([label, value]) => <div className="rules-point-row" key={label}><span>{label}</span><b>{value}</b></div>)}</div>
          <p className="rules-note">{rule.note}</p>
        </article>)}
      </div>

      <section className="rules-card rules-final">
        <div className="rules-card-heading"><span className="rules-icon">🚫</span><div><h2>Penalidades e elegibilidade</h2><p>Regras gerais aplicadas ao fechamento do ranking</p></div></div>
        <div className="rules-points">
          <div className="rules-point-row"><span>Lançamento negativo</span><b>Desconta pontos do total</b></div>
          <div className="rules-point-row"><span>Pontuação final negativa</span><b>O total mínimo é 0</b></div>
          <div className="rules-point-row"><span>Jogador inelegível ou sem WhatsApp confirmado</span><b>Não pontua no ranking</b></div>
          <div className="rules-point-row"><span>Liderança do clã</span><b>Não participa da classificação de premiação</b></div>
        </div>
        <p className="rules-note">A elegibilidade é conferida no cadastro do jogador. Líder e co-líderes permanecem fora da disputa do ranking de premiação.</p>
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
