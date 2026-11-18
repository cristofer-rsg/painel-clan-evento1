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


def is_before_final_twelve_hours(observed_at, war_end):
    """True when the attack was first observed before the final 12-hour window."""
    if observed_at is None or war_end is None:
        return False
    return observed_at < war_end - timedelta(hours=12)


def should_penalize_off_mirror(attack_number, observed_at, war_end):
    """The mirror requirement applies only to attack 1 before the final window."""
    return attack_number == 1 and is_before_final_twelve_hours(
        observed_at, war_end
    )


def should_penalize_early_second_attack(attack_number, observed_at, war_end):
    """Attack 2 must be detected before the final 12-hour window."""
    return attack_number >= 2 and is_before_final_twelve_hours(
        observed_at, war_end
    )
