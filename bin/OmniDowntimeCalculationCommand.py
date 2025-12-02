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
              begin_time, end_time, dt_filter, dt_pattern, id
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
                'error': f"-999 : Invalid JSON format, expected dict or list, got {type(downtime_json).__name__}",
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
            'dt_pattern': downtime_json.get('dt_pattern', ''),
            'format': 'json',
            'original_json': downtime_json,
            'original_str': downtime_str
        }
    except (json.JSONDecodeError, ValueError, TypeError):
        data_downtime = downtime_str.split('#')
        
        if len(data_downtime) != 5:
            return {
                'error': f"-999 : Invalid format, expected 5 parts, got {len(data_downtime)}",
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
            'dt_pattern': '',
            'format': 'legacy',
            'original_str': downtime_str
        }


def evaluate_filter(record, filter_expression, logger):
    """
    Évalue si un événement correspond à une expression de filtre
    
    Supporte les opérateurs: =, !=, <, >, <=, >=
    Supporte les opérateurs logiques: AND, OR
    
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
            
        pattern = r'(\w+)\s*(<=|>=|!=|=|<|>)\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|[\d.]+)'
        
        def evaluate_comparison(match):
            field_name = match.group(1)
            operator = match.group(2)
            expected_value = match.group(3).strip('"\'')
            
            actual_value = record.get(field_name, '')
            
            try:
                expected_num = float(expected_value)
                actual_num = float(actual_value)
                is_numeric = True
            except (ValueError, TypeError):
                is_numeric = False
            
            if is_numeric:
                if operator == '=': return actual_num == expected_num
                elif operator == '!=': return actual_num != expected_num
                elif operator == '<': return actual_num < expected_num
                elif operator == '>': return actual_num > expected_num
                elif operator == '<=': return actual_num <= expected_num
                elif operator == '>=': return actual_num >= expected_num
            else:
                actual_str = str(actual_value)
                expected_str = str(expected_value)
                if operator == '=': return actual_str == expected_str
                elif operator == '!=': return actual_str != expected_str
                elif operator == '<': return actual_str < expected_str
                elif operator == '>': return actual_str > expected_str
                elif operator == '<=': return actual_str <= expected_str
                elif operator == '>=': return actual_str >= expected_str
            
            return False
        
        comparisons = re.finditer(pattern, filter_expression)
        result_expr = filter_expression
        
        for match in comparisons:
            comparison_result = evaluate_comparison(match)
            result_expr = result_expr.replace(match.group(0), str(comparison_result))
        
        result_expr = result_expr.replace(' AND ', ' and ').replace(' OR ', ' or ')
        
        return eval(result_expr)
        
    except Exception as e:
        logger.error(f"Erreur lors de l'évaluation du filtre '{filter_expression}': {str(e)}")
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
        **Syntax:** **skip_filter=***<bool>*
        **Description:** Si true, ignore l'évaluation des filtres dt_filter et considère uniquement la période de downtime
        **Default:** false""",
        require=False,
        default=False,
        validate=validators.Boolean()
    )

    def stream(self, records):
        epoctime = str(self.epoctime).rstrip()
        dtfield = str(self.dtfield).rstrip()
        outputfield = str(self.outputfield).rstrip()
        skip_filter = self.skip_filter  # Récupération de l'option

        self.logger.debug("DowntimeCalculationCommand => skip_filter: %s", skip_filter)

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
            
            modified_downtimes = []
            found_match = False
            
            for downtime in downtime_field:
                if (
                    not downtime
                    or downtime is None
                    or downtime == 0
                    or downtime == "0"
                ):
                    modified_downtimes.append(downtime)
                    continue
                
                parsed_dt = parse_downtime_data(downtime)
                
                if parsed_dt.get('format') == 'error':
                    record["DT_ERROR"] = parsed_dt.get('error')
                    modified_downtimes.append(downtime)
                    continue
                
                downtime_type = parsed_dt['dt_type']
                begin_dt_days = parsed_dt['begin_date']
                end_dt_days = parsed_dt['end_date']
                begin_dt_hours = parsed_dt['begin_time']
                end_dt_hours = parsed_dt['end_time']
                dt_filter = parsed_dt['dt_filter']
                dt_pattern = parsed_dt['dt_pattern']
                dt_id = parsed_dt['id']
                
                current_downtime_result = 0

                if downtime_type == "weekly":
                    current_downtime_result = int(downtime_weekly(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                elif downtime_type == "between_date":
                    self.logger.debug("DowntimeCalculationCommand => downtime_type: %s", downtime_type)
                    current_downtime_result = int(downtime_between_days(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                elif downtime_type == "monthly":
                    current_downtime_result = int(downtime_monthly(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                elif downtime_type == "special_date_first_in_month":
                    current_downtime_result = int(downtime_date_first_in_month(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                elif downtime_type == "special_date_second_in_month":
                    current_downtime_result = int(downtime_date_second_in_month(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                elif downtime_type == "special_date_third_in_month":
                    current_downtime_result = int(downtime_date_third_in_month(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                elif downtime_type == "special_date_fourth_in_month":
                    current_downtime_result = int(downtime_date_fourth_in_month(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                elif downtime_type == "special_date_last_in_month":
                    current_downtime_result = int(downtime_date_last_in_month(
                        event_time, begin_dt_days, begin_dt_hours,
                        end_dt_days, end_dt_hours,
                    ))
                else:
                    record["DT_ERROR"] = (
                        f"-999 : downtime_type not in the list : value = {downtime_type}"
                    )
                    modified_downtimes.append(downtime)
                    continue
                
                # ============================================
                # LOGIQUE AVEC skip_filter
                # ============================================
                in_filter = 0
                
                if current_downtime_result == 1:
                    if skip_filter:
                        # Si skip_filter=true, on ignore l'évaluation du filtre
                        in_filter = 1
                        self.logger.debug("DowntimeCalculationCommand => skip_filter=true, in_filter forcé à 1")
                    else:
                        # Comportement normal : évaluation du filtre
                        self.logger.debug("DowntimeCalculationCommand => in_dt=1, testing filter: %s", dt_filter)
                        
                        if not dt_filter or dt_filter.strip() == '':
                            in_filter = 1
                            self.logger.debug("DowntimeCalculationCommand => No filter defined, in_filter=1")
                        else:
                            filter_result = evaluate_filter(record, dt_filter, self.logger)
                            in_filter = 1 if filter_result else 0
                            self.logger.debug("DowntimeCalculationCommand => Filter evaluation result: %s (in_filter=%d)", 
                                            filter_result, in_filter)
                else:
                    in_filter = 0
                    self.logger.debug("DowntimeCalculationCommand => in_dt=0, skipping filter test")
                
                # ============================================
                # FIN DE LA LOGIQUE skip_filter
                # ============================================
                
                if parsed_dt.get('format') == 'json':
                    downtime_with_result = parsed_dt['original_json'].copy()
                    downtime_with_result[outputfield] = current_downtime_result
                    downtime_with_result['in_filter'] = in_filter
                    modified_downtimes.append(json.dumps(downtime_with_result))
                    
                    if current_downtime_result == 1 and in_filter == 1 and not found_match:
                        found_match = True
                        record[outputfield] = 1
                        if dt_filter:
                            record['dt_filter'] = dt_filter
                        if dt_pattern:
                            record['dt_pattern'] = dt_pattern
                        if dt_id:
                            record['dt_id'] = dt_id
                        self.logger.debug("DowntimeCalculationCommand => MATCH FOUND! in_dt=1 AND in_filter=1")
                        break
                    else:
                        self.logger.debug("DowntimeCalculationCommand => No complete match (in_dt=%d, in_filter=%d), continuing...", 
                                        current_downtime_result, in_filter)
                else:
                    modified_downtimes.append(downtime)
                    if current_downtime_result > 0 and not found_match:
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
