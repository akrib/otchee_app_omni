#!/usr/bin/env python
from __future__ import (
    absolute_import,
    division,
    print_function,
    unicode_literals,
)
import os
import sys
import json
import datetime
import splunklib
# applib = os.path.abspath(os.path.join(__file__, "..", "..", "lib"))
# sys.path.append(applib)

# splunkhome = os.environ["SPLUNK_HOME"]
# sys.path.append(
#     os.path.join(splunkhome, "etc", "apps", "otchee_app_omni", "lib")
# )

# import results
import splunklib.results as results
from splunklib.searchcommands import (Configuration, Option, StreamingCommand, dispatch)  # noqa

appname = "otchee_app_omni"
collection = "omni_kv"
lookup = "omni_kv"
kvlog = "omni_kv_trace_log"


class KVStoreClient:
    def __init__(self, APPNAME, COLLECTION, LOOKUP, service):
        self.APPNAME = APPNAME
        self.COLLECTION = COLLECTION
        self.LOOKUP = LOOKUP
        self.service = service
        self.path = "storage/collections/data/%s" % (self.COLLECTION)
        self.headers = [('content-type', 'application/json')]

    def get_all(self, key=None):
        rData = self.service.get(
            self.path, 
            # method="GET",
            headers=self.headers,
            owner='nobody',
            app=self.APPNAME
        )
        rData = json.loads(rData['body'].read())

        return rData

    def get_by_field(self, field, value):
        records = []
        allByField = self.service.jobs.create(
            "|inputlookup %s | search %s=%s" % (
                self.LOOKUP, field, str(value)
            ),
            **{"exec_mode": "blocking"}
        )
        allByField = allByField.results(count=0,output_mode='json')
        #for record in results.ResultsReader(allByField):
        for record in results.JSONResultsReader(allByField):
            if isinstance(record, dict):
                records.append(record)
            elif isinstance(record, results.Message):
                print("Message: %s" % record)

        return records

    def get_by_key(self, key):
        allByKey = self.service.jobs.create(
            "|inputlookup %s | rename _key AS key | search key=%s" % (
                self.LOOKUP, key
            ),
            **{"exec_mode": "blocking"}
        )
        allByKey = allByKey.results(count=0,output_mode='json')

        return next(record in results.JSONResultsReader(allByKey), None)

    def delete_by_field(self, field, value):
        records = self.get_by_field(field, value)

        for record in records:
            self.delete_key(record['_key'])

        return records

    def delete_key(self, key):
        deleted = self.service.delete(
            self.path+'/'+key,
            # headers=self.headers,
            owner='nobody',
            app=self.APPNAME
        )
        return deleted

    def add(self, content):
        newKey = self.service.post(
            self.path,
            headers=self.headers,
            owner='nobody',
            app=self.APPNAME,
            body=json.dumps(content)
        )
        return json.loads(newKey['body'].read())['_key']

    def update(self, key, content):
        updated = self.service.post(
            self.path + "/%s" % (key),
            headers=self.headers,
            owner='nobody',
            app=self.APPNAME,
            body=json.dumps(content)
        )
        return updated


def isNull(value):
    if type(value) == type("string"):
        return len(value) == 0
    elif (value is None
          or not bool(value)
          or value == "0"
          or value == "undefined"
          ):
        return True
    return False


@Configuration()
class omnikvupdate(StreamingCommand):
    """ manage the DLTkv_store
    ##Syntax
    .. code-block::
        | omnikvupdate
            action=("add"|"update"|"delete") debug=(true|false)
    .. code-block::
        | table ID,client,site,host,hostgroup,host_criticity,downtime
        | omnikvupdate action="add"
    """

    action = Option(
        doc="""
        **Syntax:** **action=***("add"|"update"|"delete")*
        **Description:** action type""",
        require=True,
    )

    def stream(self, records):
        """ Computes sum(fieldname, 1, n) and stores the result in 'total' """
        for record in records:
            result = str("")
            try:
                result = "omnikvupdate: "
                if self.action == "add":
                    error = 0
                    errorOutput = ""
                    add = ['service',
                           'kpi',
                           'entity',
                           'commentary',
                           'creator',
                           'downtime',
                           'dt_update',
                           'ID',
                           'version',
                           'step_opt'
                           ]
                    for addField in add:
                        if isNull(record[addField]):
                            error += 1
                            errorOutput += addField + " field is Null;"

                    if error == 0:
                        result += str(self.add(record))
                    else:
                        result = str("ERREUR: " + errorOutput)

                elif self.action == "update":
                    error = 0
                    errorOutput = ""
                    add = ['key',
                           'service',
                           'kpi',
                           'entity',
                           'commentary',
                           'creator',
                           'downtime',
                           'dt_update',
                           'ID',
                           'version',
                           'step_opt'
                           ]
                    for addField in add:
                        if isNull(record[addField]):
                            error += 1
                            errorOutput += addField + " field is Null;"

                    if error == 0:
                        result += str(self.update(record))
                    else:
                        result = str("ERREUR: " + errorOutput)

                elif self.action == "delete":
                    error = 0
                    errorOutput = ""
                    if isNull(record['key']):
                        error += 1
                        errorOutput += "key field is Null;"
                    if error == 0:
                        result += str(self.delete(record))
                    else:
                        result = str("ERREUR: " + errorOutput)
                else:
                    result += str("Action incorecte, "
                                  + " les actions possibles sont"
                                  + " (en muniscule):"
                                  + " add, update ou delete")
            except ValueError:
                result = str(" Erreur inconnue " + str(ValueError))
            record["result"] = str(result)
            yield record

    def add(self, record):
        try:
            record["action"] = str("add")
            kv = KVStoreClient(appname, collection, lookup, self.service)
            kv.add(record)
            trace_log = KVStoreClient(appname, kvlog, kvlog, self.service)
            #record["action"] = str("add")
            trace_log.add(record)
            return str(" Ajout OK")
        except ValueError:
            return str(" Ajout interrompu " + str(ValueError))
            
    def update(self, record):
        try:
            kv = KVStoreClient(appname, collection, lookup, self.service)
            kv.update(record["key"], record)
            trace_log = KVStoreClient(appname, kvlog, kvlog, self.service)
            record["action"] = str("update")
            trace_log.add(record)
            record["action"] = str("obsolete")
            record["downtime"] = str("between_date#"
                                     +str(datetime.date.today())
                                     +"#"
                                     +str(datetime.date.today())
                                     +"#00:00:00#00:00:00")
            record["version"] = int(record["version"]) - 1
            record["version"]

            trace_log.add(record)
            return str(" Mise a jour OK")
        except ValueError:
            return str(" Mise a jour interrompue " + str(ValueError))

    def delete(self, record):
        try:
            kv = KVStoreClient(appname, collection, lookup, self.service)
            kv.delete_key(record["key"])
            trace_log = KVStoreClient(appname, kvlog, kvlog, self.service)
            record["action"] = str("delete")
            record["version"] = 99999
            record["creator"] = self._metadata.searchinfo.username
            # record["downtime"] = str("between_date#"
            #                          +str(datetime.date.today())
            #                          +"#"
            #                          +str(datetime.date.today())
            #                          +"#00:00:00#00:00:00")
            trace_log.add(record)
            return str(" Suppression OK")
        except ValueError:
            return str(" Suppression interrompue " + str(ValueError))


dispatch(omnikvupdate, sys.argv, sys.stdin, sys.stdout, __name__)
