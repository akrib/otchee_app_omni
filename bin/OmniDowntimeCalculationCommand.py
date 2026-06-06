#!/usr/bin/env python
# coding: utf-8
from __future__ import (
    absolute_import,
    division,
    print_function,
    unicode_literals,
)

import os
import sys

bin_path = os.path.join(os.path.dirname(os.path.abspath(__file__)))
if bin_path not in sys.path:
    sys.path.insert(0, bin_path)


import datetime
import json
import re
import traceback

# Pour Python 3.7+
if sys.version_info >= (3, 7):
    try:
        sys.stdin.reconfigure(errors='ignore')
    except AttributeError:
        pass

from splunklib.searchcommands import (
    Configuration,
    Option,
    StreamingCommand,
    dispatch,
    validators
)

import locale
try:
    locale.setlocale(locale.LC_ALL, '')
except Exception:
    pass


def dt_split(dt_text):
    """Divise le texte de date/heure selon le délimiteur trouvé"""
    if "," in dt_text:
        return dt_text.split(",")
    elif ";" in dt_text:
        return dt_text.split(";")
    else:
        return dt_text


def downtime_weekly(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans un downtime hebdomadaire"""
    event = datetime.datetime.fromtimestamp(event_time)
    day = event.weekday()
    basedays = ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"]
    begin_dt_days = dt_split(begin_dt_days)

    if basedays[day] in begin_dt_days:
        startDT = begin_dt_hours.split(":")
        endDT = end_dt_hours.split(":")
        todaystart = event.replace(
            hour=int(startDT[0]),
            minute=int(startDT[1]),
            second=0,
            microsecond=0,
        )
        if endDT[0] == "24":
            todayend = (
                event.replace(
                    hour=0,
                    minute=int(endDT[1]),
                    second=0,
                    microsecond=0)
                + datetime.timedelta(days=1))
        else:
            todayend = event.replace(
                hour=int(endDT[0]),
                minute=int(endDT[1]),
                second=0,
                microsecond=0,
            )
        if event >= todaystart and event <= todayend:
            in_downtime = 1
        else:
            in_downtime = 0
    else:
        in_downtime = 0
    return in_downtime


def downtime_between_days(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans un downtime entre deux dates"""
    event = datetime.datetime.fromtimestamp(event_time)
    starDTDate = begin_dt_days.split("-")
    startDTTime = begin_dt_hours.split(":")
    endDTDate = end_dt_days.split("-")
    endDTTime = end_dt_hours.split(":")

    start_downtime = datetime.datetime(
        int(starDTDate[0]),
        int(starDTDate[1]),
        int(starDTDate[2]),
        int(startDTTime[0]),
        int(startDTTime[1]),
        int(startDTTime[2]),
    )

    # Gestion spéciale de 24:00:00 - ajouter un jour et mettre à 00:00:00
    if endDTTime[0] == "24" or int(endDTTime[0]) == 24:
        end_downtime = datetime.datetime(
            int(endDTDate[0]),
            int(endDTDate[1]),
            int(endDTDate[2]),
            0,  # Heure à 0
            0,  # Minute à 0
            0,  # Seconde à 0
        ) + datetime.timedelta(days=1)  # Ajouter un jour
    else:
        end_downtime = datetime.datetime(
            int(endDTDate[0]),
            int(endDTDate[1]),
            int(endDTDate[2]),
            int(endDTTime[0]),
            int(endDTTime[1]),
            int(endDTTime[2]),
        )

    if event >= start_downtime and event <= end_downtime:
        in_downtime = 1
    else:
        in_downtime = 0
    return in_downtime


def downtime_monthly(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans un downtime mensuel"""
    event = datetime.datetime.fromtimestamp(event_time)
    monthday = event.strftime("%d")
    begin_dt_days = dt_split(begin_dt_days)

    if monthday in begin_dt_days:
        start_downtime = begin_dt_hours.split(":")
        end_downtime = end_dt_hours.split(":")
        todaystart = event.replace(
            hour=int(start_downtime[0]),
            minute=int(start_downtime[1]),
            second=0,
            microsecond=0,
        )
        if end_downtime[0] == "24":
            todayend = event.replace(
                hour=0, minute=int(end_downtime[1]), second=0, microsecond=0
            ) + datetime.timedelta(days=1)
        else:
            todayend = event.replace(
                hour=int(end_downtime[0]),
                minute=int(end_downtime[1]),
                second=0,
                microsecond=0,
            )
        if event > todaystart and event < todayend:
            in_downtime = 1
        else:
            in_downtime = 0
    else:
        in_downtime = 0
    return in_downtime


def downtime_date_first_in_month(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans le premier downtime du mois"""
    basedays = ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"]
    event = datetime.datetime.fromtimestamp(event_time)
    monthday = int(event.strftime("%d"))
    day = event.weekday()
    begin_dt_days = dt_split(begin_dt_days)

    if basedays[day] in begin_dt_days:
        if monthday < 8:
            startDT = begin_dt_hours.split(":")
            endDT = end_dt_hours.split(":")
            todaystart = event.replace(
                hour=int(startDT[0]),
                minute=int(startDT[1]),
                second=0,
                microsecond=0,
            )
            if endDT[0] == "24":
                todayend = event.replace(
                    hour=0,
                    minute=int(endDT[1]),
                    second=0,
                    microsecond=0,
                ) + datetime.timedelta(days=1)
            else:
                todayend = event.replace(
                    hour=int(endDT[0]),
                    minute=int(endDT[1]),
                    second=0,
                    microsecond=0,
                )
            if event >= todaystart and event <= todayend:
                in_downtime = 1
            else:
                in_downtime = 0
        else:
            in_downtime = 0
    else:
        in_downtime = 0
    return in_downtime


def downtime_date_second_in_month(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans le second downtime du mois"""
    basedays = ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"]
    event = datetime.datetime.fromtimestamp(event_time)
    monthday = int(event.strftime("%d"))
    day = event.weekday()
    begin_dt_days = dt_split(begin_dt_days)

    if basedays[day] in begin_dt_days:
        if monthday > 7 and monthday < 15:
            startDT = begin_dt_hours.split(":")
            endDT = end_dt_hours.split(":")
            todaystart = event.replace(
                hour=int(startDT[0]),
                minute=int(startDT[1]),
                second=0,
                microsecond=0,
            )
            if endDT[0] == "24":
                todayend = event.replace(
                    hour=0, minute=int(endDT[1]), second=0, microsecond=0
                ) + datetime.timedelta(days=1)
            else:
                todayend = event.replace(
                    hour=int(endDT[0]),
                    minute=int(endDT[1]),
                    second=0,
                    microsecond=0,
                )
            if event >= todaystart and event <= todayend:
                in_downtime = 1
            else:
                in_downtime = 0
        else:
            in_downtime = 0
    else:
        in_downtime = 0
    return in_downtime


def downtime_date_third_in_month(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans le troisième downtime du mois"""
    basedays = ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"]
    event = datetime.datetime.fromtimestamp(event_time)
    monthday = int(event.strftime("%d"))
    day = event.weekday()
    begin_dt_days = dt_split(begin_dt_days)

    if basedays[day] in begin_dt_days:
        if monthday > 14 and monthday < 22:
            startDT = begin_dt_hours.split(":")
            endDT = end_dt_hours.split(":")
            todaystart = event.replace(
                hour=int(startDT[0]),
                minute=int(startDT[1]),
                second=0,
                microsecond=0,
            )
            if endDT[0] == "24":
                todayend = event.replace(
                    hour=0, minute=int(endDT[1]), second=0, microsecond=0
                ) + datetime.timedelta(days=1)
            else:
                todayend = event.replace(
                    hour=int(endDT[0]),
                    minute=int(endDT[1]),
                    second=0,
                    microsecond=0,
                )
            if event >= todaystart and event <= todayend:
                in_downtime = 1
            else:
                in_downtime = 0
        else:
            in_downtime = 0
    else:
        in_downtime = 0
    return in_downtime


def downtime_date_fourth_in_month(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans le quatrième downtime du mois"""
    basedays = ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"]
    event = datetime.datetime.fromtimestamp(event_time)
    monthday = int(event.strftime("%d"))
    day = event.weekday()
    begin_dt_days = dt_split(begin_dt_days)

    if basedays[day] in begin_dt_days:
        if monthday > 21 and monthday < 29:
            startDT = begin_dt_hours.split(":")
            endDT = end_dt_hours.split(":")
            todaystart = event.replace(
                hour=int(startDT[0]),
                minute=int(startDT[1]),
                second=0,
                microsecond=0,
            )
            if endDT[0] == "24":
                todayend = event.replace(
                    hour=0, minute=int(endDT[1]), second=0, microsecond=0
                ) + datetime.timedelta(days=1)
            else:
                todayend = event.replace(
                    hour=int(endDT[0]),
                    minute=int(endDT[1]),
                    second=0,
                    microsecond=0,
                )
            if event >= todaystart and event <= todayend:
                in_downtime = 1
            else:
                in_downtime = 0
        else:
            in_downtime = 0
    else:
        in_downtime = 0
    return in_downtime


def downtime_date_last_in_month(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    """Vérifie si l'événement est dans le dernier downtime du mois"""
    basedays = ["Monday", "Tuesday", "Wednesday", "Thursday",
                "Friday", "Saturday", "Sunday"]
    event = datetime.datetime.fromtimestamp(event_time)
    monthPlusOne = event.replace(month=event.month % 12 + 1, day=1)
    detlaOneDay = datetime.timedelta(days=1)
    dayInMonth = (monthPlusOne - detlaOneDay).day
    monthday = int(event.strftime("%d"))
    day = event.weekday()
    begin_dt_days = dt_split(begin_dt_days)

    if basedays[day] in begin_dt_days:
        if monthday > (dayInMonth - 7):
            startDt = begin_dt_hours.split(":")
            endDt = end_dt_hours.split(":")
            todaystart = event.replace(
                hour=int(startDt[0]),
                minute=int(startDt[1]),
                second=0,
                microsecond=0,
            )
            if endDt[0] == "24":
                todayend = event.replace(
                    hour=0,
                    minute=int(endDt[1]),
                    second=0,
                    microsecond=0
                )
                todayend += datetime.timedelta(days=1)
            else:
                todayend = event.replace(
                    hour=int(endDt[0]),
                    minute=int(endDt[1]),
                    second=0,
                    microsecond=0,
                )
            if event >= todaystart and event <= todayend:
                in_downtime = 1
            else:
                in_downtime = 0
        else:
            in_downtime = 0
    else:
        in_downtime = 0
    return in_downtime


def parse_downtime_data(downtime_str):
    """
    Parse le downtime qu'il soit au format legacy (# séparé) ou JSON

    Args:
        downtime_str: String contenant soit le format legacy soit un JSON

    Returns:
        dict: Dictionnaire avec les clés dt_type, begin_date, end_date,
              begin_time, end_time, dt_filter, dt_policy, id
    """
    try:
        downtime_json = json.loads(downtime_str)

        # Handle case where JSON is a list - take the first element
        if isinstance(downtime_json, list):
            if len(downtime_json) == 0:
                return {
                    'error': "-999 : Empty JSON array",
                    'format': 'error'
                }
            downtime_json = downtime_json[0]

        # Ensure downtime_json is a dictionary
        if not isinstance(downtime_json, dict):
            return {
                'error': "-999 : Invalid JSON format, expected dict or list, got {}".format(
                    type(downtime_json).__name__),
                'format': 'error'
            }

        return {
            'id': downtime_json.get('id', ''),
            'dt_type': downtime_json.get('dt_type', ''),
            'begin_date': downtime_json.get('begin_date', ''),
            'end_date': downtime_json.get('end_date', ''),
            'begin_time': downtime_json.get('begin_time', ''),
            'end_time': downtime_json.get('end_time', ''),
            'dt_filter': downtime_json.get('dt_filter', ''),
            'dt_policy': downtime_json.get('dt_policy', ''),
            'format': 'json',
            'original_json': downtime_json,
            'original_str': downtime_str
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        data_downtime = downtime_str.split('#')

        if len(data_downtime) != 5:
            return {
                'error': "-999 : Invalid format, expected 5 parts, got {}".format(
                    len(data_downtime)),
                'format': 'error'
            }

        return {
            'id': '',
            'dt_type': data_downtime[0],
            'begin_date': data_downtime[1],
            'end_date': data_downtime[2],
            'begin_time': data_downtime[3],
            'end_time': data_downtime[4],
            'dt_filter': '',
            'dt_policy': '',
            'format': 'legacy',
            'original_str': downtime_str
        }


# Sentinelle posée par le dashboard pour les maintenances ITSI (pas de filtre
# au niveau champ : la portée service/kpi/entity suffit).
SKIP_FILTER_SENTINEL = 'omni_skip_filter=1'

# Pattern d'un nom de champ. Couvre les champs Splunk usuels (lettres, chiffres,
# underscore, point, tiret) -> gère par ex. "kpi.title" ou "host-name".
_FIELD = r'[\w.\-]+'

# Regex compilées une seule fois, réutilisées pour chaque expression simple.
_RE_ISNOTNULL = re.compile(r'^isnotnull\(\s*(' + _FIELD + r')\s*\)$', re.IGNORECASE)
_RE_ISNULL = re.compile(r'^isnull\(\s*(' + _FIELD + r')\s*\)$', re.IGNORECASE)
# Le nom de champ est restreint à _FIELD : cela évite qu'une valeur contenant
# le mot "LIKE" (ex: status="x LIKE y") ne soit prise pour un opérateur LIKE.
_RE_LIKE = re.compile(r'^(' + _FIELD + r')\s+LIKE\s+(.+)$', re.IGNORECASE)
_RE_CMP = re.compile(r'^(' + _FIELD + r')\s*(<=|>=|!=|=|<|>)\s*(.+)$')


def _strip_quotes(value):
    """Retire une éventuelle paire de guillemets simples ou doubles."""
    value = value.strip()
    if len(value) >= 2 and (
        (value[0] == '"' and value[-1] == '"')
        or (value[0] == "'" and value[-1] == "'")
    ):
        return value[1:-1]
    return value


def _like_to_regex(pattern):
    """
    Convertit un motif LIKE en regex.

    Le caractère '%' est le joker (-> '.*'), tout le reste est littéral.
    Implémentation indépendante de la version de Python : on découpe sur '%'
    puis on échappe chaque morceau (re.escape n'échappe plus '%' en 3.7+, ce
    qui cassait l'ancienne approche basée sur replace).
    """
    return '^' + '.*'.join(re.escape(part) for part in pattern.split('%')) + '$'


def _split_logical_operators(expr):
    """Découpe l'expression sur les AND/OR de premier niveau (hors guillemets)."""
    parts = []
    current = []
    in_quotes = False
    quote_char = None
    i = 0

    while i < len(expr):
        char = expr[i]

        if char in ('"', "'") and (i == 0 or expr[i - 1] != '\\'):
            if not in_quotes:
                in_quotes = True
                quote_char = char
            elif char == quote_char:
                in_quotes = False
                quote_char = None

        if not in_quotes:
            if expr[i:i + 5].upper() == ' AND ':
                parts.append((''.join(current).strip(), 'AND'))
                current = []
                i += 5
                continue
            elif expr[i:i + 4].upper() == ' OR ':
                parts.append((''.join(current).strip(), 'OR'))
                current = []
                i += 4
                continue

        current.append(char)
        i += 1

    if current:
        parts.append((''.join(current).strip(), None))

    return parts


def _evaluate_single_expression(record, expr, logger):
    """
    Évalue une expression simple (sans AND/OR).

    Gère le NOT en tête (NOT par champ, conformément à l'UI du dashboard),
    isnull/isnotnull, LIKE (avec joker '%') et les comparaisons
    =, !=, <, >, <=, >= (numériques ou textuelles).
    """
    expr = expr.strip()

    local_negate = False
    if expr.upper().startswith('NOT '):
        local_negate = True
        expr = expr[4:].strip()

    def finish(result):
        return (not result) if local_negate else result

    # isnotnull(field) -- testé avant isnull pour lever toute ambiguïté
    m = _RE_ISNOTNULL.match(expr)
    if m:
        actual = record.get(m.group(1), '')
        return finish(actual != '' and actual is not None)

    # isnull(field)
    m = _RE_ISNULL.match(expr)
    if m:
        actual = record.get(m.group(1), '')
        return finish(actual == '' or actual is None)

    # field LIKE "..."   (Contient / Commence par / Finit par)
    m = _RE_LIKE.match(expr)
    if m:
        field_name = m.group(1)
        pattern_value = _strip_quotes(m.group(2))
        actual_value = str(record.get(field_name, ''))
        regex_pattern = _like_to_regex(pattern_value)
        try:
            result = bool(re.match(regex_pattern, actual_value, re.IGNORECASE))
            logger.debug(
                "LIKE: field=%s pattern=%s actual=%s regex=%s result=%s",
                field_name, pattern_value, actual_value, regex_pattern, result)
            return finish(result)
        except Exception as e:
            logger.error("Erreur regex LIKE: %s", str(e))
            return False

    # field <op> value
    m = _RE_CMP.match(expr)
    if m:
        field_name = m.group(1)
        operator = m.group(2)
        expected_value = _strip_quotes(m.group(3))
        actual_value = record.get(field_name, '')

        # Tentative de comparaison numérique
        try:
            expected_num = float(expected_value)
            actual_num = float(actual_value)
            is_numeric = True
        except (ValueError, TypeError):
            is_numeric = False

        if is_numeric:
            a, b = actual_num, expected_num
        else:
            a, b = str(actual_value), str(expected_value)

        if operator == '=':
            result = a == b
        elif operator == '!=':
            result = a != b
        elif operator == '<':
            result = a < b
        elif operator == '>':
            result = a > b
        elif operator == '<=':
            result = a <= b
        elif operator == '>=':
            result = a >= b
        else:
            result = False

        return finish(result)

    logger.warning("Expression de filtre non reconnue: %s", expr)
    return False


def evaluate_filter(record, filter_expression, logger):
    """
    Évalue si un événement correspond à une expression de filtre.

    Supporte les opérateurs: =, !=, <, >, <=, >=, LIKE
    Supporte les opérateurs logiques: AND, OR (priorité AND avant OR)
    Supporte NOT (par sous-expression, comme le génère le dashboard)
    Supporte LIKE avec joker '%' : %value%, value%, %value
    Supporte isnull(field) et isnotnull(field)

    La sentinelle 'omni_skip_filter=1' (maintenances ITSI) et un filtre vide
    sont considérés comme "pas de filtre" -> True.

    Args:
        record: L'enregistrement Splunk
        filter_expression: L'expression de filtre à évaluer
        logger: Logger pour les erreurs

    Returns:
        bool: True si le filtre correspond, False sinon
    """
    try:
        if not filter_expression or filter_expression.strip() == '':
            return True

        expression = filter_expression.strip()

        # Maintenances ITSI : aucun filtre champ à appliquer.
        if expression == SKIP_FILTER_SENTINEL:
            return True

        parts = _split_logical_operators(expression)

        if len(parts) == 1:
            return _evaluate_single_expression(record, parts[0][0], logger)

        # Expression complexe : on évalue chaque membre puis on applique
        # les opérateurs logiques avec la priorité AND avant OR.
        results = [
            _evaluate_single_expression(record, part, logger)
            for part, _ in parts
        ]
        operators = [op for _, op in parts if op]

        # Passe 1 : résolution des AND
        i = 0
        while i < len(operators):
            if operators[i] == 'AND':
                results[i] = results[i] and results[i + 1]
                del results[i + 1]
                del operators[i]
            else:
                i += 1

        # Passe 2 : résolution des OR restants
        final_result = results[0]
        for i, op in enumerate(operators):
            if op == 'OR':
                final_result = final_result or results[i + 1]

        return final_result

    except Exception as e:
        logger.error(
            "Erreur lors de l'évaluation du filtre '%s': %s",
            filter_expression, str(e))
        logger.error(traceback.format_exc())
        return False


@Configuration()
class DLTDowntimeCalculationCommand(StreamingCommand):
    """
    Vérifie si une période est en downtime

    Syntaxe:
        | omnidowntimecalculation epoctime=<fieldname> dtfield=<fieldname> outputfield=<fieldname> skip_filter=<bool>

    Exemple:
        | inputlookup tweets
        | omnidowntimecalculation epoctime=_time dtfield=downtimes outputfield=in_dt
        | omnidowntimecalculation epoctime=_time dtfield=downtimes outputfield=in_dt skip_filter=true
    """

    epoctime = Option(
        doc="""
        **Syntax:** **epoctime=***<fieldname>*
        **Description:** Nom du champ contenant la valeur temporelle""",
        require=True,
        validate=validators.Fieldname(),
    )

    dtfield = Option(
        doc="""
        **Syntax:** **dtfield=***<fieldname>*
        **Description:** Champ contenant les données de downtime""",
        require=True,
        validate=validators.Fieldname(),
    )

    outputfield = Option(
        doc="""
        **Syntax:** **outputfield=***<fieldname>*
        **Description:** Nom du champ qui contiendra la valeur de downtime""",
        require=True,
        validate=validators.Fieldname(),
    )

    skip_filter = Option(
        doc="""
        **Syntax:** **skip_filter=***<fieldname>*
        **Description:** Nom du champ à évaluer. Si la valeur du champ est 1, ignore l'évaluation des filtres dt_filter
        **Default:** Aucun (le filtre est toujours évalué si non spécifié)""",
        require=False,
        default=None,
        validate=validators.Fieldname()
    )

    # Aiguillage type de downtime -> fonction de fenêtre temporelle
    _DOWNTIME_DISPATCH = {
        "weekly": downtime_weekly,
        "between_date": downtime_between_days,
        "monthly": downtime_monthly,
        "special_date_first_in_month": downtime_date_first_in_month,
        "special_date_second_in_month": downtime_date_second_in_month,
        "special_date_third_in_month": downtime_date_third_in_month,
        "special_date_fourth_in_month": downtime_date_fourth_in_month,
        "special_date_last_in_month": downtime_date_last_in_month,
    }

    def stream(self, records):
        epoctime = str(self.epoctime).rstrip()
        dtfield = str(self.dtfield).rstrip()
        outputfield = str(self.outputfield).rstrip()
        skip_filter_field = str(self.skip_filter).rstrip() if self.skip_filter else None

        self.logger.debug("DowntimeCalculationCommand => skip_filter_field: %s", skip_filter_field)

        for record in records:
            record[outputfield] = 0

            if (record.get(dtfield) == ""
                or record.get(dtfield) is None
                or record.get(dtfield) == 0
                or record.get(dtfield) == "0"
            ):
                yield record
                continue

            try:
                event_time = int(float(record.get(epoctime, 0)))
            except (ValueError, TypeError):
                event_time = 0

            self.logger.debug("DowntimeCalculationCommand => event Value: %s",
                              datetime.datetime.fromtimestamp(event_time))
            self.logger.debug("DowntimeCalculationCommand => epoctime Value: %s",
                              record.get(epoctime))

            downtime_field_value = record.get(dtfield)
            if not isinstance(downtime_field_value, list):
                downtime_field = [downtime_field_value]
            else:
                downtime_field = downtime_field_value

            self.logger.debug("DowntimeCalculationCommand => downtime_field: %s",
                              downtime_field)

            # Détermine une seule fois si on doit ignorer le filtre pour cet
            # enregistrement (option de commande skip_filter).
            should_skip_filter = False
            if skip_filter_field:
                field_value = record.get(skip_filter_field, "0")
                try:
                    should_skip_filter = (int(field_value) == 1)
                except (ValueError, TypeError):
                    should_skip_filter = (str(field_value).lower() in ["1", "true", "yes"])
                self.logger.debug(
                    "DowntimeCalculationCommand => skip_filter from field '%s': value=%s, should_skip=%s",
                    skip_filter_field, field_value, should_skip_filter)

            modified_downtimes = list(downtime_field)
            found_match = False

            for i, downtime in enumerate(downtime_field):
                if (
                    not downtime
                    or downtime is None
                    or downtime == 0
                    or downtime == "0"
                ):
                    # modified_downtimes[i] déjà = valeur originale
                    continue

                parsed_dt = parse_downtime_data(downtime)

                if parsed_dt.get('format') == 'error':
                    record["DT_ERROR"] = parsed_dt.get('error')
                    # modified_downtimes[i] déjà = valeur originale
                    continue

                downtime_type = parsed_dt['dt_type']
                begin_dt_days = parsed_dt['begin_date']
                end_dt_days = parsed_dt['end_date']
                begin_dt_hours = parsed_dt['begin_time']
                end_dt_hours = parsed_dt['end_time']
                dt_filter = parsed_dt['dt_filter']
                dt_policy = parsed_dt['dt_policy']
                dt_id = parsed_dt['id']

                handler = self._DOWNTIME_DISPATCH.get(downtime_type)
                if handler is None:
                    record["DT_ERROR"] = (
                        "-999 : downtime_type not in the list : value = {}".format(downtime_type)
                    )
                    # modified_downtimes[i] déjà = valeur originale ; pas d'append
                    continue

                if downtime_type == "between_date":
                    self.logger.debug(
                        "DowntimeCalculationCommand => downtime_type: %s", downtime_type)

                current_downtime_result = int(handler(
                    event_time, begin_dt_days, begin_dt_hours,
                    end_dt_days, end_dt_hours,
                ))

                # ============================================
                # LOGIQUE D'ÉVALUATION DU FILTRE
                # ============================================
                in_filter = 0

                if current_downtime_result == 1:
                    if should_skip_filter:
                        # Option de commande : on ignore l'évaluation du filtre
                        in_filter = 1
                        self.logger.debug(
                            "DowntimeCalculationCommand => skip_filter active (field=%s), in_filter forcé à 1",
                            skip_filter_field)
                    elif (not dt_filter
                          or dt_filter.strip() == ''
                          or dt_filter.strip() == SKIP_FILTER_SENTINEL):
                        # Pas de filtre (maintenance ITSI ou filtre vide)
                        in_filter = 1
                        self.logger.debug(
                            "DowntimeCalculationCommand => Aucun filtre à appliquer, in_filter=1")
                    else:
                        self.logger.debug(
                            "DowntimeCalculationCommand => in_dt=1, testing filter: %s", dt_filter)
                        filter_result = evaluate_filter(record, dt_filter, self.logger)
                        in_filter = 1 if filter_result else 0
                        self.logger.debug(
                            "DowntimeCalculationCommand => Filter evaluation result: %s (in_filter=%d)",
                            filter_result, in_filter)
                else:
                    in_filter = 0
                    self.logger.debug(
                        "DowntimeCalculationCommand => in_dt=0, skipping filter test")
                # ============================================

                if parsed_dt.get('format') == 'json':
                    downtime_with_result = parsed_dt['original_json'].copy()
                    downtime_with_result[outputfield] = (
                        1 if (current_downtime_result == 1 and in_filter == 1) else 0)
                    downtime_with_result['is_time_match'] = current_downtime_result
                    downtime_with_result['in_filter'] = in_filter
                    modified_downtimes[i] = json.dumps(downtime_with_result)

                    if current_downtime_result == 1 and in_filter == 1 and not found_match:
                        found_match = True
                        record[outputfield] = 1
                        if dt_filter and dt_filter.strip() != SKIP_FILTER_SENTINEL:
                            record['dt_filter'] = dt_filter
                        if dt_policy:
                            record['dt_policy'] = dt_policy
                        if dt_id:
                            record['dt_id'] = dt_id
                        self.logger.debug(
                            "DowntimeCalculationCommand => MATCH FOUND! in_dt=1 AND in_filter=1")
                        break
                    else:
                        self.logger.debug(
                            "DowntimeCalculationCommand => No complete match (in_dt=%d, in_filter=%d), continuing...",
                            current_downtime_result, in_filter)
                else:
                    modified_downtimes[i] = downtime
                    if current_downtime_result == 1 and in_filter == 1 and not found_match:
                        found_match = True
                        record[outputfield] = 1
                        break

            if len(modified_downtimes) == 1:
                record[dtfield] = modified_downtimes[0]
            elif len(modified_downtimes) > 1:
                record[dtfield] = modified_downtimes

            yield record


if __name__ == '__main__':

    dispatch(DLTDowntimeCalculationCommand, sys.argv, sys.stdin, sys.stdout, __name__)
