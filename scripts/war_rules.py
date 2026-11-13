from datetime import timedelta


def is_before_final_twelve_hours(battle_time, war_end):
    """True only when the attack happened before the final 12-hour window."""
    if battle_time is None or war_end is None:
        return False
    return battle_time < war_end - timedelta(hours=12)


def should_penalize_off_mirror(attack_number, battle_time, war_end):
    """The mirror requirement applies only to attack 1 before the final window."""
    return attack_number == 1 and is_before_final_twelve_hours(
        battle_time, war_end
    )


def should_penalize_early_second_attack(attack_number, battle_time, war_end):
    """Preserve the existing rule: attack 2 must be saved for the final 12 hours."""
    return attack_number >= 2 and is_before_final_twelve_hours(
        battle_time, war_end
    )
