#!/usr/bin/env python
# coding: utf-8
from __future__ import (
    absolute_import,
    division,
    print_function,
    unicode_literals,
) # noqa

import datetime
import json
import os
import sys
import re

sys.stdin.reconfigure(errors='ignore') # noqa python 3.7 and after

from splunklib.searchcommands import (
    Configuration,
    Option,
    StreamingCommand,
    dispatch,
    validators
)  # noqa

import locale
try:
    locale.setlocale(locale.LC_ALL, '')
except:
    pass

def dt_split(dt_text):
    if("," in dt_text):
        return dt_text.split(",")
    elif(";" in dt_text):
        return dt_text.split(";")
    else:
        return dt_text


def downtime_weekly(
    event_time, begin_dt_days, begin_dt_hours, end_dt_days, end_dt_hours
):
    event = datetime.datetime.fromtimestamp(event_time)
    day = event.weekday()
    basedays = ["Monday", "Tuesday",
               "Wednesday", "Thursday",
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
    if endDTTime[0] == "24":
        endDTTime = [23, 59, 59]
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
    basedays = ["Monday", "Tuesday",
                "Wednesday", "Thursday",
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
    basedays = ["Monday", "Tuesday",
                "Wednesday", "Thursday",
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
    basedays = ["Monday", "Tuesday",
                "Wednesday", "Thursday",
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
    basedays = ["Monday", "Tuesday",
                "Wednesday", "Thursday",
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
    basedays = ["Monday", "Tuesday",
                "Wednesday", "Thursday",
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
    Parse le downtime qu'il soit au format legacy (# separé) ou JSON
    
    Args:
        downtime_str: String contenant soit le format legacy soit un JSON
        
    Returns:
        dict: Dictionnaire avec les clés dt_type, begin_date, end_date, begin_time, end_time, dt_filter, dt_pattern, id
    """
    try:
        # Tentative de parsing JSON
        downtime_json = json.loads(downtime_str)
        
        # Format JSON détecté
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
        # Format legacy avec séparateur #
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
        # Si pas de filtre, on retourne True
        if not filter_expression or filter_expression.strip() == '':
            return True
            
        # Pattern pour trouver les comparaisons
        pattern = r'(\w+)\s*(<=|>=|!=|=|<|>)\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|[\d.]+)'
        
        def evaluate_comparison(match):
            field_name = match.group(1)
            operator = match.group(2)
            expected_value = match.group(3).strip('"\'')
            
            # Récupérer la valeur du champ dans l'événement
            actual_value = record.get(field_name, '')
            
            # Convertir en nombres si possible
            try:
                expected_num = float(expected_value)
                actual_num = float(actual_value)
                is_numeric = True
            except (ValueError, TypeError):
                is_numeric = False
            
            # Évaluer la comparaison
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
        
        # Trouver toutes les comparaisons et les évaluer
        comparisons = re.finditer(pattern, filter_expression)
        result_expr = filter_expression
        
        for match in comparisons:
            comparison_result = evaluate_comparison(match)
            result_expr = result_expr.replace(match.group(0), str(comparison_result))
        
        # Remplacer AND et OR par leurs équivalents Python
        result_expr = result_expr.replace(' AND ', ' and ').replace(' OR ', ' or ')
        
        # Évaluer l'expression booléenne finale
        return eval(result_expr)
        
    except Exception as e:
        logger.error(f"Erreur lors de l'évaluation du filtre '{filter_expression}': {str(e)}")
        return False  # En cas d'erreur, on considère que le filtre ne match pas


@Configuration()
class DLTDowntimeCalculationCommand(StreamingCommand):
    """ Check if a timeperiod is in downtime
    ##Syntax
    .. code-block::
        | downtimecalculation
            epoctime=<fieldname>
            dtfield=<fieldname>
            outputfield=<fieldname>
    .. code-block::
        | inputlookup tweets
        | downtimecalculation
            epoctime=_time
            dtfield=downtimes
            outputfield=in_dt
    """

    epoctime = Option(
        doc="""
        **Syntax:** **epoctime=***<fieldname>*
        **Description:** Name of the field that contain the timevalue""",
        require=True,
        validate=validators.Fieldname(),
    )

    dtfield = Option(
        doc="""
        **Syntax:** **dtfield=***<fieldname>*
        **Description:** Regular expression pattern to match""",
        require=True,
        validate=validators.Fieldname(),
    )

    outputfield = Option(
        doc="""
        **Syntax:** **fieldname=***<fieldname>*
        **Description:** Name of the field that will hold the
        downtime value""",
        require=True,
        validate=validators.Fieldname(),
    )

    def stream(self, records):
        epoctime = str(self.epoctime).rstrip()
        dtfield = str(self.dtfield).rstrip()
        outputfield = str(self.outputfield).rstrip()

        for record in records:
            record[outputfield] = 0
            
            if (record[dtfield] == ""
                or record[dtfield] is None
                or record[dtfield] == 0
                or record[dtfield] == "0"
            ):
                yield record
                continue
                
            try:
                event_time = int(float(record[epoctime]))
            except ValueError:
                event_time = 0
                
            self.logger.error("----------DowntimeCalculationCommand => event Value: %s", datetime.datetime.fromtimestamp(event_time))
            self.logger.error("----------DowntimeCalculationCommand => epoctime Value: %s", record[epoctime])
            
            if(type(record[dtfield]) is not list):
                downtime_field = [record[dtfield]]
            else:
                downtime_field = record[dtfield]
                
            self.logger.error("----------DowntimeCalculationCommand => downtime_field: %s", record[dtfield])
            
            # Liste pour stocker les downtimes modifiés
            modified_downtimes = []
            found_match = False
            
            for downtime in downtime_field:
                if (
                    len(downtime) == 0
                    or downtime is None
                    or downtime == 0
                    or downtime == "0"
                ):
                    # Ajouter tel quel si vide
                    modified_downtimes.append(downtime)
                    continue
                
                # Parse le downtime (JSON ou legacy)
                parsed_dt = parse_downtime_data(downtime)
                
                # Gestion des erreurs de parsing
                if parsed_dt.get('format') == 'error':
                    record["DT_ERROR"] = parsed_dt.get('error')
                    modified_downtimes.append(downtime)
                    continue
                
                # Extraction des données parsées
                downtime_type = parsed_dt['dt_type']
                begin_dt_days = parsed_dt['begin_date']
                end_dt_days = parsed_dt['end_date']
                begin_dt_hours = parsed_dt['begin_time']
                end_dt_hours = parsed_dt['end_time']
                dt_filter = parsed_dt['dt_filter']
                dt_pattern = parsed_dt['dt_pattern']
                dt_id = parsed_dt['id']
                
                # Variable pour stocker le résultat du test de downtime actuel
                current_downtime_result = 0

                # Calcul du downtime selon le type
                if downtime_type == "weekly":
                    current_downtime_result = int(downtime_weekly(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "between_date":
                    self.logger.error("----------DowntimeCalculationCommand => downtime_type: %s", downtime_type)
                    self.logger.error("----------DowntimeCalculationCommand => event_time: %s", event_time)
                    self.logger.error("----------DowntimeCalculationCommand => begin_dt_days: %s", begin_dt_days)
                    self.logger.error("----------DowntimeCalculationCommand => begin_dt_hours: %s", begin_dt_hours)
                    self.logger.error("----------DowntimeCalculationCommand => end_dt_days: %s", end_dt_days)
                    self.logger.error("----------DowntimeCalculationCommand => end_dt_hours: %s", end_dt_hours)
                    current_downtime_result = int(downtime_between_days(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "monthly":
                    current_downtime_result = int(downtime_monthly(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_first_in_month":
                    current_downtime_result = int(downtime_date_first_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_second_in_month":
                    current_downtime_result = int(downtime_date_second_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_third_in_month":
                    current_downtime_result = int(downtime_date_third_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_fourth_in_month":
                    current_downtime_result = int(downtime_date_fourth_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_last_in_month":
                    current_downtime_result = int(downtime_date_last_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                else:
                    record["DT_ERROR"] = str(
                        "-999 : downtime_type not in the list : value = "
                        + str(downtime_type)
                    )
                    modified_downtimes.append(downtime)
                    continue
                
                # Variable pour stocker le résultat de l'évaluation du filtre
                in_filter = 0
                
                # Si in_dt est à 1, on teste le filtre
                if current_downtime_result == 1:
                    self.logger.error("----------DowntimeCalculationCommand => in_dt=1, testing filter: %s", dt_filter)
                    
                    # Si pas de filtre défini, on considère que le filtre est validé
                    if not dt_filter or dt_filter.strip() == '':
                        in_filter = 1
                        self.logger.error("----------DowntimeCalculationCommand => No filter defined, in_filter=1")
                    else:
                        # Évaluer le filtre
                        filter_result = evaluate_filter(record, dt_filter, self.logger)
                        in_filter = 1 if filter_result else 0
                        self.logger.error("----------DowntimeCalculationCommand => Filter evaluation result: %s (in_filter=%d)", filter_result, in_filter)
                else:
                    # Si in_dt est à 0, on ne teste pas le filtre
                    in_filter = 0
                    self.logger.error("----------DowntimeCalculationCommand => in_dt=0, skipping filter test")
                
                # Modifier le downtime selon le format
                if parsed_dt.get('format') == 'json':
                    # Créer une copie du JSON original et ajouter les champs
                    downtime_with_result = parsed_dt['original_json'].copy()
                    downtime_with_result[outputfield] = current_downtime_result
                    downtime_with_result['in_filter'] = in_filter
                    modified_downtimes.append(json.dumps(downtime_with_result))
                    
                    # Si in_dt ET in_filter sont à 1, on a trouvé un match complet
                    if current_downtime_result == 1 and in_filter == 1 and not found_match:
                        found_match = True
                        record[outputfield] = 1
                        if dt_filter:
                            record['dt_filter'] = dt_filter
                        if dt_pattern:
                            record['dt_pattern'] = dt_pattern
                        if dt_id:
                            record['dt_id'] = dt_id
                        self.logger.error("----------DowntimeCalculationCommand => MATCH FOUND! in_dt=1 AND in_filter=1")
                        # On break car on a trouvé un match complet
                        break
                    else:
                        # Si pas de match complet, on continue à chercher
                        self.logger.error("----------DowntimeCalculationCommand => No complete match (in_dt=%d, in_filter=%d), continuing...", current_downtime_result, in_filter)
                else:
                    # Format legacy - garder tel quel
                    # Pour le legacy, on garde le comportement original (pas de test de filtre)
                    modified_downtimes.append(downtime)
                    if current_downtime_result > 0 and not found_match:
                        found_match = True
                        record[outputfield] = 1
                        break
            
            # Remplacer le champ dtfield par la version modifiée
            if len(modified_downtimes) == 1:
                record[dtfield] = modified_downtimes[0]
            elif len(modified_downtimes) > 1:
                record[dtfield] = modified_downtimes
                    
            yield record

dispatch(DLTDowntimeCalculationCommand,  sys.argv, sys.stdin, sys.stdout, __name__)
