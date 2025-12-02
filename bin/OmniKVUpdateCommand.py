#!/usr/bin/env python
# coding: utf-8
"""
OmniKVUpdateCommand - Custom Splunk command for managing downtime records in KVStore

This command handles add, update, and delete operations for the omni_kv collection.
Compatible with latest splunklib version.
"""

from __future__ import absolute_import, division, print_function, unicode_literals

import os
import sys

bin_path = os.path.join(os.path.dirname(os.path.abspath(__file__)))
if bin_path not in sys.path:
    sys.path.insert(0, bin_path)


import json
import datetime

import splunklib.client as client
import splunklib.results as results
from splunklib.searchcommands import (
    Configuration,
    Option,
    StreamingCommand,
    dispatch,
    validators
)

# Application configuration
APPNAME = "otchee_app_omni"
COLLECTION = "omni_kv"
LOOKUP = "omni_kv"
KVLOG = "omni_kv_trace_log"


class KVStoreClient:
    """
    Client pour interagir avec le KVStore de Splunk
    Compatible avec les dernières versions de splunklib
    """
    
    def __init__(self, app_name, collection_name, lookup_name, service):
        """
        Initialise le client KVStore
        
        Args:
            app_name: Nom de l'application Splunk
            collection_name: Nom de la collection KVStore
            lookup_name: Nom du lookup
            service: Instance du service Splunk
        """
        self.app_name = app_name
        self.collection_name = collection_name
        self.lookup_name = lookup_name
        self.service = service
        self.path = f"storage/collections/data/{self.collection_name}"
        self.headers = [('content-type', 'application/json')]

    def get_all(self):
        """
        Récupère tous les enregistrements de la collection
        
        Returns:
            list: Liste des enregistrements
        """
        try:
            response = self.service.get(
                self.path,
                headers=self.headers,
                owner='nobody',
                app=self.app_name
            )
            return json.loads(response['body'].read())
        except Exception as e:
            raise Exception(f"Error getting all records: {str(e)}")

    def get_by_field(self, field, value):
        """
        Récupère les enregistrements par champ
        
        Args:
            field: Nom du champ
            value: Valeur à rechercher
            
        Returns:
            list: Liste des enregistrements correspondants
        """
        records = []
        try:
            search_query = f"|inputlookup {self.lookup_name} | search {field}=\"{value}\""
            job = self.service.jobs.create(
                search_query,
                **{"exec_mode": "blocking"}
            )
            
            # Attendre que le job soit terminé
            while not job.is_done():
                pass
            
            # Récupérer les résultats
            results_stream = job.results(count=0, output_mode='json')
            reader = results.JSONResultsReader(results_stream)
            
            for record in reader:
                if isinstance(record, dict):
                    records.append(record)
                elif isinstance(record, results.Message):
                    # Log des messages si nécessaire
                    pass
                    
            job.cancel()  # Nettoyer le job
            
        except Exception as e:
            raise Exception(f"Error getting records by field {field}: {str(e)}")
            
        return records

    def get_by_key(self, key):
        """
        Récupère un enregistrement par sa clé
        
        Args:
            key: Clé de l'enregistrement
            
        Returns:
            dict: Enregistrement ou None
        """
        try:
            search_query = f"|inputlookup {self.lookup_name} | rename _key AS key | search key=\"{key}\""
            job = self.service.jobs.create(
                search_query,
                **{"exec_mode": "blocking"}
            )
            
            while not job.is_done():
                pass
            
            results_stream = job.results(count=0, output_mode='json')
            reader = results.JSONResultsReader(results_stream)
            
            record = None
            for result in reader:
                if isinstance(result, dict):
                    record = result
                    break
                    
            job.cancel()
            return record
            
        except Exception as e:
            raise Exception(f"Error getting record by key {key}: {str(e)}")

    def delete_by_field(self, field, value):
        """
        Supprime les enregistrements par champ
        
        Args:
            field: Nom du champ
            value: Valeur à rechercher
            
        Returns:
            list: Liste des enregistrements supprimés
        """
        records = self.get_by_field(field, value)
        
        for record in records:
            if '_key' in record:
                self.delete_key(record['_key'])
                
        return records

    def delete_key(self, key):
        """
        Supprime un enregistrement par sa clé
        
        Args:
            key: Clé de l'enregistrement
            
        Returns:
            Response object
        """
        try:
            deleted = self.service.delete(
                f"{self.path}/{key}",
                owner='nobody',
                app=self.app_name
            )
            return deleted
        except Exception as e:
            raise Exception(f"Error deleting key {key}: {str(e)}")

    def add(self, content):
        """
        Ajoute un nouvel enregistrement
        
        Args:
            content: Dictionnaire contenant les données
            
        Returns:
            str: Clé du nouvel enregistrement
        """
        try:
            response = self.service.post(
                self.path,
                headers=self.headers,
                owner='nobody',
                app=self.app_name,
                body=json.dumps(content)
            )
            return json.loads(response['body'].read())['_key']
        except Exception as e:
            raise Exception(f"Error adding record: {str(e)}")

    def update(self, key, content):
        """
        Met à jour un enregistrement existant
        
        Args:
            key: Clé de l'enregistrement
            content: Dictionnaire contenant les nouvelles données
            
        Returns:
            Response object
        """
        try:
            updated = self.service.post(
                f"{self.path}/{key}",
                headers=self.headers,
                owner='nobody',
                app=self.app_name,
                body=json.dumps(content)
            )
            return updated
        except Exception as e:
            raise Exception(f"Error updating key {key}: {str(e)}")


def is_null(value):
    """
    Vérifie si une valeur est nulle ou vide
    
    Args:
        value: Valeur à vérifier
        
    Returns:
        bool: True si la valeur est nulle/vide
    """
    if isinstance(value, str):
        return len(value.strip()) == 0
    elif (value is None 
          or value == 0 
          or value == "0" 
          or value == "undefined"
          or (isinstance(value, bool) and not value)):
        return True
    return False


def is_null_optional(value):
    """
    Vérifie si une valeur optionnelle est nulle (accepte les chaînes vides)
    
    Args:
        value: Valeur à vérifier
        
    Returns:
        bool: True si la valeur est None ou "undefined"
    """
    if value is None or value == "undefined":
        return True
    return False


@Configuration()
class OmniKVUpdate(StreamingCommand):
    """
    Commande personnalisée Splunk pour gérer le KVStore omni_kv
    
    Syntaxe:
        | omnikvupdate action=("add"|"update"|"delete")
    
    Exemple:
        | makeresults 
        | eval service="web", kpi="availability", entity="server01"
        | omnikvupdate action="add"
    
    Champs requis:
        - action: Type d'action (add, update, delete)
        - service: Service(s) concerné(s)
        - kpi: KPI(s) concerné(s)
        - entity: Entité(s) concernée(s)
        - commentary: Commentaire
        - creator: Créateur du downtime
        - downtime: Configuration du downtime (JSON ou format legacy)
        - dt_update: Timestamp de mise à jour
        - ID: Identifiant unique
        - version: Version du downtime
        - step_opt: Options d'étape
        - dt_filter: Filtre de downtime
    
    Champs optionnels:
        - dt_pattern: Pattern de downtime (peut être vide)
    """
    
    action = Option(
        doc="""
        **Syntax:** **action=***("add"|"update"|"delete")*
        **Description:** Type d'action à effectuer sur le KVStore
        **Required:** True
        """,
        require=True,
        validate=validators.Set('add', 'update', 'delete')
    )

    def stream(self, records):
        """
        Traite chaque enregistrement et effectue l'action demandée
        
        Args:
            records: Générateur d'enregistrements Splunk
            
        Yields:
            dict: Enregistrement avec le résultat de l'opération
        """
        for record in records:
            result = ""
            
            try:
                result = "omnikvupdate: "
                
                if self.action == "add":
                    error, error_output = self._validate_add_fields(record)
                    
                    if error == 0:
                        result += self._add_record(record)
                    else:
                        result = f"ERREUR: {error_output}"
                        
                elif self.action == "update":
                    error, error_output = self._validate_update_fields(record)
                    
                    if error == 0:
                        result += self._update_record(record)
                    else:
                        result = f"ERREUR: {error_output}"
                        
                elif self.action == "delete":
                    error, error_output = self._validate_delete_fields(record)
                    
                    if error == 0:
                        result += self._delete_record(record)
                    else:
                        result = f"ERREUR: {error_output}"
                else:
                    result += ("Action incorrecte, les actions possibles sont "
                              "(en minuscule): add, update ou delete")
                              
            except Exception as e:
                result = f"Erreur inconnue: {str(e)}"
                self.logger.error(f"Error in stream: {str(e)}")
                
            record["result"] = str(result)
            yield record

    def _validate_add_fields(self, record):
        """
        Valide les champs requis pour l'ajout
        
        Args:
            record: Enregistrement à valider
            
        Returns:
            tuple: (nombre d'erreurs, message d'erreur)
        """
        error = 0
        error_output = ""
        
        # Champs obligatoires
        required_fields = [
            'service',
            'kpi',
            'entity',
            'commentary',
            'creator',
            'downtime',
            'dt_update',
            'ID',
            'version',
            'step_opt',
            'dt_filter'
        ]
        
        # Champs optionnels (peuvent être vides mais doivent exister)
        optional_fields = ['dt_pattern']
        
        # Validation des champs obligatoires
        for field in required_fields:
            if field not in record or is_null(record[field]):
                error += 1
                error_output += f"{field} field is Null or missing; "
        
        # Ajout des champs optionnels s'ils n'existent pas
        for field in optional_fields:
            if field not in record:
                record[field] = ''  # Valeur par défaut
            elif is_null_optional(record[field]):
                record[field] = ''  # Normaliser les valeurs null
                
        return error, error_output

    def _validate_update_fields(self, record):
        """
        Valide les champs requis pour la mise à jour
        
        Args:
            record: Enregistrement à valider
            
        Returns:
            tuple: (nombre d'erreurs, message d'erreur)
        """
        error = 0
        error_output = ""
        
        # Champs obligatoires (inclut 'key' pour l'update)
        required_fields = [
            'key',
            'service',
            'kpi',
            'entity',
            'commentary',
            'creator',
            'downtime',
            'dt_update',
            'ID',
            'version',
            'step_opt',
            'dt_filter'
        ]
        
        # Champs optionnels
        optional_fields = ['dt_pattern']
        
        # Validation des champs obligatoires
        for field in required_fields:
            if field not in record or is_null(record[field]):
                error += 1
                error_output += f"{field} field is Null or missing; "
        
        # Ajout des champs optionnels s'ils n'existent pas
        for field in optional_fields:
            if field not in record:
                record[field] = ''
            elif is_null_optional(record[field]):
                record[field] = ''
                
        return error, error_output

    def _validate_delete_fields(self, record):
        """
        Valide les champs requis pour la suppression
        
        Args:
            record: Enregistrement à valider
            
        Returns:
            tuple: (nombre d'erreurs, message d'erreur)
        """
        error = 0
        error_output = ""
        
        if 'key' not in record or is_null(record['key']):
            error += 1
            error_output += "key field is Null or missing; "
            
        return error, error_output

    def _add_record(self, record):
        """
        Ajoute un nouvel enregistrement dans le KVStore
        
        Args:
            record: Enregistrement à ajouter
            
        Returns:
            str: Message de confirmation
        """
        try:
            # Ajouter dans la collection principale
            kv = KVStoreClient(APPNAME, COLLECTION, LOOKUP, self.service)
            new_key = kv.add(record)
            
            # Ajouter dans le log de traçabilité
            trace_log = KVStoreClient(APPNAME, KVLOG, KVLOG, self.service)
            record["action"] = "add"
            record["trace_timestamp"] = datetime.datetime.now().isoformat()
            trace_log.add(record)
            
            self.logger.info(f"Record added successfully with key: {new_key}")
            return f"Ajout OK (key: {new_key})"
            
        except Exception as e:
            error_msg = f"Ajout interrompu: {str(e)}"
            self.logger.error(error_msg)
            return error_msg

    def _update_record(self, record):
        """
        Met à jour un enregistrement existant dans le KVStore
        
        Args:
            record: Enregistrement à mettre à jour
            
        Returns:
            str: Message de confirmation
        """
        try:
            key = record["key"]
            
            # Mise à jour dans la collection principale
            kv = KVStoreClient(APPNAME, COLLECTION, LOOKUP, self.service)
            kv.update(key, record)
            
            # Traçabilité - Enregistrement de la mise à jour
            trace_log = KVStoreClient(APPNAME, KVLOG, KVLOG, self.service)
            
            # Log de l'action update
            trace_record = record.copy()
            trace_record["action"] = "update"
            trace_record["trace_timestamp"] = datetime.datetime.now().isoformat()
            trace_log.add(trace_record)
            
            # Log de l'ancienne version (obsolète)
            obsolete_record = record.copy()
            obsolete_record["action"] = "obsolete"
            obsolete_record["trace_timestamp"] = datetime.datetime.now().isoformat()
            obsolete_record["downtime"] = (
                f"between_date#{datetime.date.today()}#"
                f"{datetime.date.today()}#00:00:00#00:00:00"
            )
            
            # Décrémenter la version pour l'obsolète
            try:
                obsolete_record["version"] = int(record["version"]) - 1
            except (ValueError, KeyError):
                obsolete_record["version"] = 0
                
            trace_log.add(obsolete_record)
            
            self.logger.info(f"Record updated successfully with key: {key}")
            return f"Mise à jour OK (key: {key})"
            
        except Exception as e:
            error_msg = f"Mise à jour interrompue: {str(e)}"
            self.logger.error(error_msg)
            return error_msg

    def _delete_record(self, record):
        """
        Supprime un enregistrement du KVStore
        
        Args:
            record: Enregistrement à supprimer
            
        Returns:
            str: Message de confirmation
        """
        try:
            key = record["key"]
            
            # Suppression de la collection principale
            kv = KVStoreClient(APPNAME, COLLECTION, LOOKUP, self.service)
            kv.delete_key(key)
            
            # Traçabilité - Enregistrement de la suppression
            trace_log = KVStoreClient(APPNAME, KVLOG, KVLOG, self.service)
            trace_record = record.copy()
            trace_record["action"] = "delete"
            trace_record["trace_timestamp"] = datetime.datetime.now().isoformat()
            trace_record["version"] = 99999
            
            # Récupérer le nom d'utilisateur depuis les métadonnées
            try:
                trace_record["creator"] = self._metadata.searchinfo.username
            except AttributeError:
                # Fallback si les métadonnées ne sont pas disponibles
                pass
                
            trace_log.add(trace_record)
            
            self.logger.info(f"Record deleted successfully with key: {key}")
            return f"Suppression OK (key: {key})"
            
        except Exception as e:
            error_msg = f"Suppression interrompue: {str(e)}"
            self.logger.error(error_msg)
            return error_msg


# Point d'entrée de la commande
dispatch(OmniKVUpdate, sys.argv, sys.stdin, sys.stdout, __name__)
