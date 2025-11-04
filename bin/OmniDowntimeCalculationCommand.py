#!/usr/bin/env python
# coding: utf-8
from __future__ import (
    absolute_import,
    division,
    print_function,
    unicode_literals,
) # noqa

import datetime
import os
import sys

sys.stdin.reconfigure(errors='ignore') # noqa python 3.7 and after
# applib = os.path.abspath(os.path.join(__file__, "..", "..", "lib")) # noqa
# sys.path.append(applib) # noqa
# splunkhome = os.environ["SPLUNK_HOME"] # noqa
# sys.path.append(os.path.join(splunkhome, "etc", "apps", "searchcommands_app", "lib"))# noqa

from splunklib.searchcommands import (
    Configuration,
    Option,
    StreamingCommand,
    dispatch,
    validators
)  # noqa

# import locale
# locale.setlocale(locale.LC_ALL, 'en_US.UTF-8')
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
    # @Configuration()
    def stream(self, records):
        # self.logger.error("----------DowntimeCalculationCommand: => sys.argv: %s", sys.argv)
        # self.logger.error("----------DowntimeCalculationCommand: => sys.stdin.encoding: %s", sys.stdin.encoding)
        # self.logger.error("----------DowntimeCalculationCommand: => sys.stdout.encoding: %s", sys.stdout.encoding)
        # self.logger.error("----------DowntimeCalculationCommand: => sys.stdout.isatty(): %s", sys.stdout.isatty())
        # self.logger.error("----------DowntimeCalculationCommand: => locale.getpreferredencoding(): %s", locale.getpreferredencoding())
        # self.logger.error("----------DowntimeCalculationCommand: => locale.getdefaultlocale(): %s", locale.getdefaultlocale())
        # self.logger.error("----------DowntimeCalculationCommand: => sys.getfilesystemencoding(): %s", sys.getfilesystemencoding())
        # self.logger.error("----------DowntimeCalculationCommand: => os.environ[\"PYTHONIOENCODING\"]: %s", os.environ["PYTHONIOENCODING"])
        # self.logger.error("----------DowntimeCalculationCommand: => sys.version_info.major: %s", sys.version_info.major)
        # self.logger.error("----------DownDowntimeCalculationCommandtimeCalculation => epoctime Field name: %s", self.epoctime)
        # self.logger.error("----------DowntimeCalculationCommand => downtime Field name: %s", self.dtfield)
        # self.logger.error("----------DowntimeCalculationCommand => output Field name: %s", self.outputfield)
        # self.logger.error("----------DowntimeCalculationCommand => records: %s", str(records))

        epoctime = str(self.epoctime).rstrip()
        dtfield = str(self.dtfield).rstrip()
        outputfield = str(self.outputfield).rstrip()

        # if dtfield not in records.keys():

        for record in records:
            record[outputfield] = 0
            if (record[dtfield] == ""
                or record[dtfield] is None
                or record[dtfield] == 0
                or record[dtfield] == "0"
            ):  # nopep8

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
            for downtime in downtime_field:
                data_downtime = None
                if (
                    len(downtime) == 0
                    or downtime is None
                    or downtime == 0
                    or downtime == "0"
                ):
                    yield record
                    continue
                
                data_downtime = downtime.split('#')
                if len(data_downtime) != 5:
                    record["DT_ERROR"] = str("-999 : len(data_downtime) !=5 : value=" + str(len(data_downtime)))  # nopep8
                    continue
                downtime_type = data_downtime[0]
                begin_dt_days = data_downtime[1]
                end_dt_days = data_downtime[2]
                begin_dt_hours = data_downtime[3]
                end_dt_hours = data_downtime[4]

                if downtime_type == "weekly":
                    record[outputfield] += int(downtime_weekly(
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
                    record[outputfield] += int(downtime_between_days(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "monthly":
                    record[outputfield] += int(downtime_monthly(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_first_in_month":
                    record[outputfield] += int(downtime_date_first_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_second_in_month":
                    record[outputfield] += int(downtime_date_second_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_third_in_month":
                    record[outputfield] += int(downtime_date_third_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_fourth_in_month":
                    record[outputfield] += int(downtime_date_fourth_in_month(
                        event_time,
                        begin_dt_days,
                        begin_dt_hours,
                        end_dt_days,
                        end_dt_hours,
                    ))
                elif downtime_type == "special_date_last_in_month":
                    record[outputfield] += int(downtime_date_last_in_month(
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
                if record[outputfield] > 0:
                    break
            yield record
dispatch(DLTDowntimeCalculationCommand,  sys.argv, sys.stdin, sys.stdout, __name__)
