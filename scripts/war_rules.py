from datetime import timedelta


def resolve_war_end(war_start, war_end, war_state=None):
    """Resolve the scheduled end without trusting a premature active-war endTime."""
    if war_start is None:
        return None

    scheduled_end = war_start + timedelta(hours=24)

    if war_state == "inWar":
        return scheduled_end

    if war_end is not None and war_end > war_start:
        return war_end

    return scheduled_end


def is_before_final_twelve_hours(observed_at, war_end, attack_battle_time=None):
    """Use the official attack timestamp when present, otherwise its first observation."""
    reference_time = attack_battle_time or observed_at
    if reference_time is None or war_end is None:
        return False
    return reference_time < war_end - timedelta(hours=12)


def should_penalize_off_mirror(
    attack_number, observed_at, war_end, attack_battle_time=None
):
    """The mirror requirement applies only to attack 1 before the final window."""
    return attack_number == 1 and is_before_final_twelve_hours(
        observed_at, war_end, attack_battle_time
    )


def should_penalize_early_second_attack(
    attack_number, observed_at, war_end, attack_battle_time=None
):
    """Attack 2 must be detected before the final 12-hour window."""
    return attack_number >= 2 and is_before_final_twelve_hours(
        observed_at, war_end, attack_battle_time
    )


def resolve_war_state(war_start, war_end, now):
    """Resolve the visible state using the API start/end timestamps."""
    if war_start is None or war_end is None or now is None:
        return "unknown"
    if now < war_start:
        return "preparation"
    if now >= war_end:
        return "warEnded"
    return "inWar"
