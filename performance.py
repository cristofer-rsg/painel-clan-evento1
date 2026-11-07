import pandas as pd
import streamlit as st


METRICS = {
    "Guerras": "war_attacks",
    "Liga dos Clãs": "league_attacks",
    "Raide": "raid_attacks",
    "Doações": "donations",
    "Jogos do Clã": "clan_games_points",
}


def render_performance(db):
    """Renderiza o desempenho mensal dos jogadores sem alterar dados."""
    st.subheader("📊 Desempenho dos jogadores")
    st.caption(
        "Consulte os indicadores individuais por mês. "
        "Guerras, Liga e Raide mostram quantidade de ataques; "
        "Doações e Jogos mostram seus respectivos totais."
    )

    try:
        players = (
            db.table("players")
            .select("name,player_tag,active")
            .order("name")
            .execute()
            .data or []
        )
        players = [
            player for player in players
            if player.get("name") and player.get("player_tag")
            and player.get("active", True) is not False
        ]

        month_rows = (
            db.table("player_monthly_stats")
            .select("month_key")
            .order("month_key", desc=True)
            .limit(5000)
            .execute()
            .data or []
        )
        months = sorted(
            {row.get("month_key") for row in month_rows if row.get("month_key")},
            reverse=True,
        )

        if not players:
            st.info("Não há jogadores ativos com tag cadastrada.")
            return

        if not months:
            st.info(
                "Ainda não há estatísticas mensais registradas. "
                "Os dados aparecerão aqui conforme os sincronizadores forem executados."
            )
            return

        selected_month = st.selectbox(
            "Mês de referência",
            months,
            index=0,
            format_func=lambda value: (
                f"{value[5:7]}/{value[:4]}"
            ),
            key="performance_month",
        )

        stats = (
            db.table("player_monthly_stats")
            .select(
                "player_tag,player,war_attacks,league_attacks,"
                "raid_attacks,donations,clan_games_points"
            )
            .eq("month_key", selected_month)
            .limit(5000)
            .execute()
            .data or []
        )

        stats_by_tag = {
            row["player_tag"]: row
            for row in stats
            if row.get("player_tag")
        }

        rows = []
        for player in players:
            stat = stats_by_tag.get(player["player_tag"], {})
            rows.append({
                "Jogador": player["name"],
                "Guerras": int(stat.get("war_attacks") or 0),
                "Liga dos Clãs": int(stat.get("league_attacks") or 0),
                "Raide": int(stat.get("raid_attacks") or 0),
                "Doações": int(stat.get("donations") or 0),
                "Jogos do Clã": int(stat.get("clan_games_points") or 0),
            })

        sort_options = list(METRICS.keys())
        sort_by = st.selectbox(
            "Ordenar jogadores por",
            sort_options,
            key="performance_sort",
        )
        descending = st.toggle(
            "Maior valor primeiro",
            value=True,
            key="performance_desc",
        )

        frame = pd.DataFrame(rows)
        frame = frame.sort_values(
            by=[sort_by, "Jogador"],
            ascending=[not descending, True],
            kind="stable",
        ).reset_index(drop=True)
        frame.insert(0, "Posição", range(1, len(frame) + 1))

        st.caption(
            f"{len(frame)} jogadores • Referência: "
            f"{selected_month[5:7]}/{selected_month[:4]}"
        )
        st.dataframe(
            frame,
            use_container_width=True,
            hide_index=True,
            height=min(700, 44 + 38 * len(frame)),
        )

        st.markdown("#### Resumo do mês")
        columns = st.columns(2)
        for index, column_name in enumerate(METRICS.keys()):
            with columns[index % 2]:
                st.metric(
                    column_name,
                    int(frame[column_name].sum()),
                )

        with st.expander("ℹ️ Como interpretar os dados"):
            st.markdown(
                "- **Guerras:** quantidade de ataques de guerra registrados.\n"
                "- **Liga dos Clãs:** soma dos ataques registrados nos dias da liga.\n"
                "- **Raide:** quantidade de ataques registrados nos fins de semana.\n"
                "- **Doações:** total doado no mês.\n"
                "- **Jogos do Clã:** pontos acumulados no evento do mês.\n\n"
                "A tela não reconstrói meses anteriores à implantação. "
                "Jogadores sem registro no mês selecionado aparecem com zero."
            )

    except Exception as error:
        st.error("Não foi possível carregar o desempenho mensal.")
        st.code(str(error))
