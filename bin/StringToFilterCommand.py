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
        require=True
    )
    
    def stream(self, records):
        """
        Traite les événements en streaming et filtre selon filter_field
        """
        try:
            for record in records:
                # Récupérer la valeur du champ filter_field
                filter_value = record.get(self.filter_field, '')
                
                # Si le champ existe et n'est pas vide, on l'utilise comme filtre
                if filter_value:
                    try:
                        # Parser la valeur du champ comme une expression de filtre
                        parsed_filter = self.parse_filter_string(str(filter_value))
                        
                        # Ajouter les champs de transformation
                        record['_original_filter_string'] = str(filter_value)
                        record['_transformed_filter'] = parsed_filter
                        record['_spl_query'] = f'| where {parsed_filter}'
                        
                        # Évaluer si l'événement correspond au filtre
                        if self.evaluate_filter(record, parsed_filter):
                            record['_filter_matched'] = 'true'
                            yield record
                        else:
                            # L'événement ne correspond pas au filtre, on ne le retourne pas
                            record['_filter_matched'] = 'false'
                            continue
                    except Exception as e:
                        # En cas d'erreur de parsing, on garde l'événement mais on log l'erreur
                        record['_filter_error'] = str(e)
                        record['_filter_matched'] = 'error'
                        yield record
                else:
                    # Si le champ filter_field n'existe pas ou est vide, on retourne l'événement
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
        """
        try:
            # Remplacer les valeurs des champs dans l'expression
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
            self.logger.error(f"Erreur lors de l'évaluation du filtre: {str(e)}")
            return True  # En cas d'erreur, on garde l'événement
    
    def parse_filter_string(self, filter_str):
        """
        Parse et transforme la string de filtrage
        
        Supporte:
        - Simple: field_name="value"
        - Multiple avec AND/OR: field1="value1" AND field2="value2"
        - Opérateurs: =, !=, <, >, <=, >=
        """
        # Nettoyer la string
        filter_str = filter_str.strip()
        
        # Pattern pour capturer field_name="field_value" ou field_name=value
        # Supporte également les autres opérateurs (!=, <, >, etc.)
        # Important: mettre les opérateurs composés (<=, >=, !=) AVANT les simples
        pattern = r'(\w+)\s*(<=|>=|!=|=|<|>)\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\'|\S+)'
        
        def replace_match(match):
            field = match.group(1)
            operator = match.group(2)
            value = match.group(3)
            
            # Garder les guillemets si présents, sinon ajouter si nécessaire
            if not (value.startswith('"') or value.startswith("'")):
                # Si c'est un nombre, on ne met pas de guillemets
                try:
                    float(value)
                    return f'{field}{operator}{value}'
                except ValueError:
                    return f'{field}{operator}"{value}"'
            
            return f'{field}{operator}{value}'
        
        # Remplacer tous les patterns
        result = re.sub(pattern, replace_match, filter_str)
        
        return result


dispatch(StringToFilterCommand, sys.argv, sys.stdin, sys.stdout, __name__)
