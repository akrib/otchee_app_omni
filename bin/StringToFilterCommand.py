#!/usr/bin/env python
# coding=utf-8

import sys
import re
from splunklib.searchcommands import (
    dispatch,
    StreamingCommand,
    Configuration,
    Option,
    validators
)


@Configuration()
class StringToFilterCommand(StreamingCommand):
    """
    Commande Splunk personnalisée qui filtre les événements en cours basé sur 
    la valeur d'un champ contenant une expression de filtrage
    
    Syntaxe:
        | stringtofilter filter_field=nom_du_champ
    
    Exemples:
        | eval my_filter='status="active"'
        | stringtofilter filter_field=my_filter
        
        | eval user_filter='user="john" AND role="admin"'
        | stringtofilter filter_field=user_filter
        
    La commande utilisera la valeur du champ spécifié pour déterminer 
    si l'événement doit être affiché ou non.
    """
    
    filter_field = Option(
        doc='''Nom du champ dont la valeur sera utilisée comme filtre pour afficher ou non l'événement''',
        require=True,
        validate=validators.Fieldname()
    )
    
    def stream(self, records):
        """
        Traite les événements en streaming et filtre selon filter_field
        """
        try:
            for record in records:
                filter_value = record.get(self.filter_field, '')
                
                if filter_value:
                    try:
                        parsed_filter = self.parse_filter_string(str(filter_value))
                        
                        record['_original_filter_string'] = str(filter_value)
                        record['_transformed_filter'] = parsed_filter
                        record['_spl_query'] = f'| where {parsed_filter}'
                        
                        if self.evaluate_filter(record, parsed_filter):
                            record['_filter_matched'] = 'true'
                            yield record
                        else:
                            record['_filter_matched'] = 'false'
                            continue
                    except Exception as e:
                        record['_filter_error'] = str(e)
                        record['_filter_matched'] = 'error'
                        self.logger.error(f"Erreur lors du parsing du filtre: {str(e)}")
                        yield record
                else:
                    record['_filter_matched'] = 'no_filter_value'
                    yield record
                    
        except Exception as e:
            self.logger.error(f"Erreur lors du traitement: {str(e)}")
            for record in records:
                record['_error'] = str(e)
                yield record
    
    def evaluate_filter(self, record, filter_expression):
        """
        Évalue si un événement correspond à une expression de filtre
        
        Supporte les opérateurs: =, !=, <, >, <=, >=
        Supporte les opérateurs logiques: AND, OR
        
        Args:
            record: L'enregistrement Splunk
            filter_expression: L'expression de filtre à évaluer
            
        Returns:
            bool: True si le filtre correspond, False sinon
        """
        try:
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
                    if operator == '=': 
                        return actual_num == expected_num
                    elif operator == '!=': 
                        return actual_num != expected_num
                    elif operator == '<': 
                        return actual_num < expected_num
                    elif operator == '>': 
                        return actual_num > expected_num
                    elif operator == '<=': 
                        return actual_num <= expected_num
                    elif operator == '>=': 
                        return actual_num >= expected_num
                else:
                    actual_str = str(actual_value)
                    expected_str = str(expected_value)
                    if operator == '=': 
                        return actual_str == expected_str
                    elif operator == '!=': 
                        return actual_str != expected_str
                    elif operator == '<': 
                        return actual_str < expected_str
                    elif operator == '>': 
                        return actual_str > expected_str
                    elif operator == '<=': 
                        return actual_str <= expected_str
                    elif operator == '>=': 
                        return actual_str >= expected_str
                
                return False
            
            comparisons = re.finditer(pattern, filter_expression)
            result_expr = filter_expression
            
            for match in comparisons:
                comparison_result = evaluate_comparison(match)
                result_expr = result_expr.replace(match.group(0), str(comparison_result))
            
            result_expr = result_expr.replace(' AND ', ' and ').replace(' OR ', ' or ')
            
            return eval(result_expr)
            
        except Exception as e:
            self.logger.error(f"Erreur lors de l'évaluation du filtre: {str(e)}")
            return True
    
    def parse_filter_string(self, filter_str):
        """
        Parse et transforme la string de filtrage
        
        Supporte:
        - Simple: field_name="value"
        - Multiple avec AND/OR: field1="value1" AND field2="value2"
        - Opérateurs: =, !=, <, >, <=, >=
        
        Args:
            filter_str: String de filtrage à parser
            
        Returns:
            str: Expression de filtre transformée
        """
        filter_str = filter_str.strip()
        
        pattern = r'(\w+)\s*(<=|>=|!=|=|<|>)\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|\S+)'
        
        def replace_match(match):
            field = match.group(1)
            operator = match.group(2)
            value = match.group(3)
            
            if not (value.startswith('"') or value.startswith("'")):
                try:
                    float(value)
                    return f'{field}{operator}{value}'
                except ValueError:
                    return f'{field}{operator}"{value}"'
            
            return f'{field}{operator}{value}'
        
        result = re.sub(pattern, replace_match, filter_str)
        
        return result


if __name__ == '__main__':
    dispatch(StringToFilterCommand, sys.argv, sys.stdin, sys.stdout, __name__)
