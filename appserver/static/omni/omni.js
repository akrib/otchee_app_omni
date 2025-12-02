var scriptName = 'Omni_Downtime';
var scriptVersion = '0.8.8'; // Version corrigée
console.log('%c %s', 'background: #222; color: #bada55', scriptName + ' Version: ' + scriptVersion);

var app_path = 'otchee_app_omni';
var viewName = '';

require(['splunkjs/mvc/utils'], function (SplunkUtil) {
    viewName = SplunkUtil.getPageInfo().page;
    require.config({
        paths: {
            'jquery-ui': '../app/' + app_path + '/omni/lib/jquery-ui.min',
        },
        shim: {
            'jquery-ui': { deps: ['jquery'] },
        },
    });

    require([
        'underscore',
        'jquery',
        'splunkjs/mvc',
        'splunkjs/mvc/searchmanager',
        'jquery-ui',
        'css!../app/' + app_path + '/omni/lib/semantic.min.css',
        'css!../app/' + app_path + '/omni/lib/jquery-ui.min.css',
        'splunkjs/mvc/simplexml/ready!',
    ], function (_, $, mvc, SearchManager) {

        // ==================== CONSTANTES ====================
        const CONFIG = {
            LOGTITLE: 'Downtime',
            UPDATE_FORM: true,
            SPACING: '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;',
            DATE_FORMAT: 'yy-mm-dd',
            TIME_REGEX: /^24:00|((([01][0-9])|(2[0-3])):[0-5][0-9])$/,
            EMAIL_REGEX: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
            PERIOD_FIELDS: {
                TYPE: 0,
                BEGIN_DAY: 1,
                END_DAY: 2,      
                BEGIN_HOUR: 3,   
                END_HOUR: 4
            },
            DOWNTIME_FIELDS: {
                KEY: 0,
                DOWNTIME: 1,
                SERVICE_TYPE: 2,
                SERVICE: 3,
                KPI_TYPE: 4,
                KPI: 5,
                ENTITY_TYPE: 6,
                ENTITY: 7,
                DT_FILTER: 8,
                DT_PATTERN: 9,
                COMMENTARY: 10,
                VERSION: 11
                
            },
            WEEK_DAYS: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
            MONTH_DAYS: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12',
                '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24',
                '25', '26', '27', '28', '29', '30', '31'],
            FILTER_OPERATORS: {
                'EQUAL_NUM': { pattern: /^([^=!<>]+)=(\d+(?:\.\d+)?)$/, label: 'nombre égal à', type: 'number' },
                'NOT_EQUAL_NUM': { pattern: /^([^=!<>]+)!=(\d+(?:\.\d+)?)$/, label: 'nombre différent de', type: 'number' },
                'LTE': { pattern: /^([^=!<>]+)<=(\d+(?:\.\d+)?)$/, label: 'nombre plus petit ou égal à', type: 'number' },
                'GTE': { pattern: /^([^=!<>]+)>=(\d+(?:\.\d+)?)$/, label: 'nombre plus grand ou égal à', type: 'number' },
                'LT': { pattern: /^([^=!<>]+)<(\d+(?:\.\d+)?)$/, label: 'nombre plus petit que', type: 'number' },
                'GT': { pattern: /^([^=!<>]+)>(\d+(?:\.\d+)?)$/, label: 'nombre plus grand que', type: 'number' },
                'ISNULL': { pattern: /^isnull\(([^)]+)\)$/, label: 'string est vide', type: 'null' },
                'ISNOTNULL': { pattern: /^isnotnull\(([^)]+)\)$/, label: 'string n\'est pas vide', type: 'null' },
                'EQUAL_STR': { pattern: /^([^=!]+)="([^"]*)"$/, label: 'string égal à', type: 'string' },
                'NOT_EQUAL_STR': { pattern: /^([^=!]+)!="([^"]*)"$/, label: 'string différent de', type: 'string' },
                'LIKE_CONTAINS': { pattern: /^([^=!]+)\s+LIKE\s+"%([^"]+)%"$/, label: 'string contient', type: 'string' },
                'LIKE_STARTS': { pattern: /^([^=!]+)\s+LIKE\s+"([^"]+)%"$/, label: 'string commence par', type: 'string' },
                'LIKE_ENDS': { pattern: /^([^=!]+)\s+LIKE\s+"%([^"]+)"$/, label: 'string finit par', type: 'string' }
            }
        };

        var numberTabs = 1;
        var debugMode = $('#debug').html() || 0;
        var token = mvc.Components.get('default', { create: true });

        // ==================== UTILITAIRES ====================
        const Utils = {
            log(obj, titre = '', level = 0) {
                if (debugMode != 1) return;
                
                const colors = ['#FFFFFF', '#FFFF00', '#FF0000'];
                const tags = ['Info', 'Warn', 'Crit'];
                const tag = CONFIG.LOGTITLE + ' ' + tags[level] || '';
                
                console.groupCollapsed('%c %s', 'background: #000000; color: ' + colors[level], tag + '--' + titre + '--');
                
                try {
                    if (Array.isArray(obj)) {
                        console.table(obj);
                    } else {
                        [console.info, console.warn, console.error][level](obj);
                    }
                } catch (err) {
                    console.error(err);
                }
                
                console.groupEnd();
            },

            isNull(variable) {
                return variable === "" || variable === null || variable === undefined || 
                       variable === false || variable === 0 || 
                       (!parseFloat(variable) && variable != 0 && typeof variable === "number");
            },

            isNotNull(variable) {
                return !this.isNull(variable);
            },

            createID() {
                const crypto = window.crypto || window.msCrypto;
                var array = new Uint32Array(1);
                crypto.getRandomValues(array);
                return (Date.now().toString(36) + crypto.getRandomValues(array).toString(36).substr(2, 5)).toUpperCase();
            },

            checkEmail(email) {
                return CONFIG.EMAIL_REGEX.test(String(email).toLowerCase());
            },

            applySleep(milliseconds) {
                var start = new Date().getTime();
                for (var i = 0; i < 1e7; i++) {
                    if (new Date().getTime() - start > milliseconds) break;
                }
            },

            getTodayDate() {
                var today = new Date();
                var dd = String(today.getDate()).padStart(2, '0');
                var mm = String(today.getMonth() + 1).padStart(2, '0');
                var yy = today.getFullYear();
                return yy + '-' + mm + '-' + dd;
            },

            escapeSPLString(value) {
                try {
                    if (this.isNull(value)) {
                        return '';
                    }
                    
                    var str = String(value);
                    str = str.replace(/\\/g, '\\\\');
                    str = str.replace(/"/g, '\\"');
                    str = str.replace(/\n/g, '\\n');
                    str = str.replace(/\r/g, '\\r');
                    str = str.replace(/\t/g, '\\t');
                    
                    return str;
                } catch (error) {
                    this.log(error, 'Erreur dans escapeSPLString', 2);
                    return '';
                }
            }
        };

        // ==================== GESTION DES TOKENS ====================
        const TokenManager = {
            set(tokenName, tokenValue, updateForm = false) {
                try {
                    var defaultTokenModel = mvc.Components.get('default', { create: true });
                    var submittedTokenModel = mvc.Components.getInstance('submitted', { create: true });
                    
                    defaultTokenModel.set(tokenName, tokenValue);
                    submittedTokenModel.set(tokenName, tokenValue);
                    
                    if (updateForm) {
                        defaultTokenModel.set('form.' + tokenName, tokenValue);
                        submittedTokenModel.set('form.' + tokenName, tokenValue);
                    }
                } catch (error) {
                    Utils.log(error, 'Erreur TokenManager.set', 2);
                }
            },

            unset(tokenName) {
                try {
                    var defaultTokenModel = mvc.Components.get('default', { create: true });
                    var submittedTokenModel = mvc.Components.getInstance('submitted', { create: true });
                    
                    defaultTokenModel.unset(tokenName);
                    submittedTokenModel.unset(tokenName);
                    defaultTokenModel.unset('form.' + tokenName);
                    submittedTokenModel.unset('form.' + tokenName);
                } catch (error) {
                    Utils.log(error, 'Erreur TokenManager.unset', 2);
                }
            },

            get(tokenName) {
                try {
                    var defaultTokenModel = mvc.Components.get('default', { create: true });
                    var submittedTokenModel = mvc.Components.getInstance('submitted', { create: true });
                    
                    // Essayer d'abord le token form.*
                    var formToken = defaultTokenModel.get('form.' + tokenName) || submittedTokenModel.get('form.' + tokenName);
                    if (Utils.isNotNull(formToken)) return formToken;
                    
                    // Puis le token normal
                    var def = defaultTokenModel.get(tokenName);
                    var sub = submittedTokenModel.get(tokenName);
                    
                    return Utils.isNotNull(def) ? def : (Utils.isNotNull(sub) ? sub : null);
                } catch (error) {
                    Utils.log(error, 'Erreur TokenManager.get', 2);
                    return null;
                }
            }
        };

        // ==================== TRANSFORMATIONS DE TEXTE ====================
        const TextTransformer = {
            forKV(value) {
                if (!value) return value;
                return value.replace(',', ';').replace('%', '*');
            },

            removeAccents(text) {
                const find = ['à', 'á', 'â', 'ã', 'ä', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï', 
                    'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ù', 'ú', 'û', 'ü', 'ý', 'ÿ',
                    'À', 'Á', 'Â', 'Ã', 'Ä', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î', 'Ï', 
                    'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ù', 'Ú', 'Û', 'Ü', 'Ý'];
                
                const replace = ['a', 'a', 'a', 'a', 'a', 'c', 'e', 'e', 'e', 'e', 'i', 'i', 'i', 'i',
                    'n', 'o', 'o', 'o', 'o', 'o', 'u', 'u', 'u', 'u', 'y', 'y',
                    'A', 'A', 'A', 'A', 'A', 'C', 'E', 'E', 'E', 'E', 'I', 'I', 'I', 'I',
                    'N', 'O', 'O', 'O', 'O', 'O', 'U', 'U', 'U', 'U', 'Y'];

                var result = text;
                for (var i = 0; i < find.length; i++) {
                    result = result.replace(new RegExp(find[i], 'g'), replace[i]);
                }
                
                result = result.replace(/[^a-zA-Z0-9_-]/g, ' ');
                return result.toLowerCase().trim();
            },

            daysToEnglish(text) {
                const translations = {
                    'Lundi': 'Monday', 'Mardi': 'Tuesday', 'Mercredi': 'Wednesday',
                    'Jeudi': 'Thursday', 'Vendredi': 'Friday', 'Samedi': 'Saturday', 'Dimanche': 'Sunday'
                };
                
                var result = text;
                Object.keys(translations).forEach(key => {
                    result = result.replace(key, translations[key]);
                });
                return result;
            },

            toVisualTags(itemString) {
                try {
                    if (Utils.isNull(itemString)) return '';
                    
                    if (itemString == '%') itemString = 'Tous';
                    
                    var items = itemString.replace("%", "*").split(';');
                    return items.map(item => '<span class="description_item">' + item + '</span>').join('');
                } catch (error) {
                    Utils.log(error, 'Error in toVisualTags', 2);
                    return '';
                }
            }
        };

        // ==================== PARSEUR DE FILTRES PERSONNALISÉS ====================
        const CustomFilterParser = {
            parse(dtFilterString) {
                Utils.log(dtFilterString, 'CustomFilterParser.parse - Input');
                
                if (Utils.isNull(dtFilterString) || dtFilterString.trim() === '') {
                    return null;
                }

                var result = {
                    raw: dtFilterString,
                    hasNot1: false,
                    expression1: null,
                    logicalOperator: null,
                    hasNot2: false,
                    expression2: null
                };

                var cleaned = dtFilterString.trim();
                
                if (cleaned.toUpperCase().startsWith('NOT ')) {
                    result.hasNot1 = true;
                    cleaned = cleaned.substring(4).trim();
                }

                var andMatch = cleaned.match(/\s+(AND)\s+/i);
                var orMatch = cleaned.match(/\s+(OR)\s+/i);
                
                var logicalOpMatch = null;
                var logicalOpIndex = -1;
                
                if (andMatch && orMatch) {
                    logicalOpIndex = Math.min(andMatch.index, orMatch.index);
                    logicalOpMatch = andMatch.index < orMatch.index ? andMatch : orMatch;
                } else if (andMatch) {
                    logicalOpMatch = andMatch;
                    logicalOpIndex = andMatch.index;
                } else if (orMatch) {
                    logicalOpMatch = orMatch;
                    logicalOpIndex = orMatch.index;
                }

                if (logicalOpMatch) {
                    result.logicalOperator = logicalOpMatch[1].toUpperCase();
                    
                    var expr1String = cleaned.substring(0, logicalOpIndex).trim();
                    var expr2String = cleaned.substring(logicalOpIndex + logicalOpMatch[0].length).trim();
                    
                    if (expr2String.toUpperCase().startsWith('NOT ')) {
                        result.hasNot2 = true;
                        expr2String = expr2String.substring(4).trim();
                    }
                    
                    result.expression1 = this.parseExpression(expr1String);
                    result.expression2 = this.parseExpression(expr2String);
                } else {
                    result.expression1 = this.parseExpression(cleaned);
                }

                Utils.log(result, 'CustomFilterParser.parse - Result');
                return result;
            },

            parseExpression(exprString) {
                Utils.log(exprString, 'parseExpression - Input');
                
                if (Utils.isNull(exprString)) return null;

                var expr = exprString.trim();
                
                for (var opKey in CONFIG.FILTER_OPERATORS) {
                    var operator = CONFIG.FILTER_OPERATORS[opKey];
                    var match = expr.match(operator.pattern);
                    
                    if (match) {
                        var result = {
                            operatorKey: opKey,
                            operatorLabel: operator.label,
                            type: operator.type,
                            field: match[1].trim(),
                            value: operator.type === 'null' ? null : (match[2] ? match[2].trim() : null),
                            raw: expr
                        };
                        
                        Utils.log(result, 'parseExpression - Matched');
                        return result;
                    }
                }

                Utils.log('parseExpression - No match found', 'parseExpression', 1);
                return {
                    operatorKey: 'UNKNOWN',
                    operatorLabel: 'Expression non reconnue',
                    type: 'unknown',
                    field: null,
                    value: null,
                    raw: expr
                };
            },

            reconstruct(parsedFilter) {
                if (!parsedFilter || !parsedFilter.expression1) {
                    return '';
                }

                var result = '';
                
                if (parsedFilter.hasNot1) {
                    result += 'NOT ';
                }
                result += this.reconstructExpression(parsedFilter.expression1);
                
                if (parsedFilter.expression2) {
                    result += ' ' + parsedFilter.logicalOperator + ' ';
                    
                    if (parsedFilter.hasNot2) {
                        result += 'NOT ';
                    }
                    result += this.reconstructExpression(parsedFilter.expression2);
                }
                
                return result;
            },

            reconstructExpression(expr) {
                if (!expr || !expr.field) {
                    return '';
                }

                var field = expr.field;
                var value = expr.value;

                switch (expr.operatorKey) {
                    case 'EQUAL_NUM':
                        return field + '=' + value;
                    case 'NOT_EQUAL_NUM':
                        return field + '!=' + value;
                    case 'LTE':
                        return field + '<=' + value;
                    case 'GTE':
                        return field + '>=' + value;
                    case 'LT':
                        return field + '<' + value;
                    case 'GT':
                        return field + '>' + value;
                    case 'ISNULL':
                        return 'isnull(' + field + ')';
                    case 'ISNOTNULL':
                        return 'isnotnull(' + field + ')';
                    case 'EQUAL_STR':
                        return field + '="' + value + '"';
                    case 'NOT_EQUAL_STR':
                        return field + '!="' + value + '"';
                    case 'LIKE_CONTAINS':
                        return field + ' LIKE "%' + value + '%"';
                    case 'LIKE_STARTS':
                        return field + ' LIKE "' + value + '%"';
                    case 'LIKE_ENDS':
                        return field + ' LIKE "%' + value + '"';
                    default:
                        return expr.raw || '';
                }
            }
        };

        // ==================== VALIDATION ====================
        const Validator = {
            timeFormat(timestr) {
                return CONFIG.TIME_REGEX.test(timestr);
            },

            endAfterBegin(dayBegin, dayEnd, begin, end) {
                if (String(dayBegin) !== String(dayEnd)) return false;
                
                var beginSplit = begin.split(':');
                var endSplit = end.split(':');
                
                var dateBegin = new Date(2001, 0, 1, parseInt(beginSplit[0], 10), parseInt(beginSplit[1], 10), 0);
                var dateEnd = new Date(2001, 0, 1, parseInt(endSplit[0], 10), parseInt(endSplit[1], 10), 0);
                
                return dateBegin.valueOf() > dateEnd.valueOf();
            },

            allDatepickers() {
                var errorMessages = '';
                var periodNumber = 1;
                
                Utils.log('Début validation datepickers', 'allDatepickers');
                
                $('[id^=content-tab-Period]').each(function () {
                    Utils.log('Validation période ' + periodNumber, 'allDatepickers');
                    
                    if ($(this).find('[periodID=radioD]').is(':checked')) {
                        var dateBegin = $(this).find('[id^=datepicker_begin]').val();
                        var dateEnd = $(this).find('[id^=datepicker_end]').val();
                        
                        Utils.log({dateBegin: dateBegin, dateEnd: dateEnd}, 'Dates période ' + periodNumber);
                        
                        var dateFormatRegex = /^\d{4}-\d{2}-\d{2}$/;
                        
                        if (!dateBegin || dateBegin.trim() === '') {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : La date de début est obligatoire<br />';
                        }
                        
                        if (!dateEnd || dateEnd.trim() === '') {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : La date de fin est obligatoire<br />';
                        }
                        
                        if (dateBegin && !dateFormatRegex.test(dateBegin)) {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : Format de date de début invalide<br />';
                        }
                        
                        if (dateEnd && !dateFormatRegex.test(dateEnd)) {
                            errorMessages += '- <b>Période ' + periodNumber + '</b> : Format de date de fin invalide<br />';
                        }
                        
                        if (dateBegin && dateEnd && dateFormatRegex.test(dateBegin) && dateFormatRegex.test(dateEnd)) {
                            if (new Date(dateEnd) < new Date(dateBegin)) {
                                errorMessages += '- <b>Période ' + periodNumber + '</b> : La date de fin doit être postérieure à la date de début<br />';
                            }
                        }
                    }
                    periodNumber++;
                });
                
                if (errorMessages) {
                    errorMessages = '<b>Impossible de valider le downtime :</b><br /><br />' + errorMessages;
                }
                
                Utils.log(errorMessages, 'Résultat validation datepickers');
                
                return errorMessages;
            }
        };

        // ==================== GESTION DES DATES ====================
        const DatePickerManager = {
            apply(minDate = Utils.getTodayDate(), div = '') {
                var from = $(div + '[id^=datepicker_begin]')
                    .datepicker({
                        defaultDate: '+1w',
                        changeMonth: true,
                        numberOfMonths: 1,
                        dateFormat: CONFIG.DATE_FORMAT,
                        minDate: minDate,
                        onSelect: function(dateText) {
                            var selectedDate = $.datepicker.parseDate(CONFIG.DATE_FORMAT, dateText);
                            if (selectedDate) {
                                DatePickerManager.enableEnd(to, selectedDate);
                                DatePickerManager.checkEndDateValidity(to, selectedDate);
                            }
                        }
                    })
                    .on('change', function () {
                        var selectedDate = DatePickerManager.getDate(this);
                        if (selectedDate) {
                            DatePickerManager.enableEnd(to, selectedDate);
                            DatePickerManager.checkEndDateValidity(to, selectedDate);
                        } else {
                            DatePickerManager.disableEnd(to);
                        }
                    });
                
                var to = $(div + '[id^=datepicker_end]')
                    .datepicker({
                        defaultDate: '+1w',
                        changeMonth: true,
                        numberOfMonths: 1,
                        dateFormat: CONFIG.DATE_FORMAT,
                        minDate: minDate,
                        onSelect: function(dateText) {
                            var selectedDate = $.datepicker.parseDate(CONFIG.DATE_FORMAT, dateText);
                            if (selectedDate) {
                                from.datepicker('option', 'maxDate', selectedDate);
                                DatePickerManager.validateEndDate(from, $(this), selectedDate);
                            }
                        }
                    })
                    .prop('disabled', true)
                    .css({
                        'background-color': '#e9ecef',
                        'cursor': 'not-allowed',
                        'opacity': '0.6'
                    })
                    .on('change', function () {
                        var selectedDate = DatePickerManager.getDate(this);
                        if (selectedDate) {
                            from.datepicker('option', 'maxDate', selectedDate);
                            DatePickerManager.validateEndDate(from, $(this), selectedDate);
                        }
                    });
                
                var fromValue = from.val();
                if (fromValue && fromValue.length > 0) {
                    try {
                        var fromDate = $.datepicker.parseDate(CONFIG.DATE_FORMAT, fromValue);
                        if (fromDate) DatePickerManager.enableEnd(to, fromDate);
                    } catch(e) {
                        Utils.log(e, 'Erreur parsing date initiale', 1);
                    }
                }
            },

            enableEnd(toElement, selectedDate) {
                toElement.prop('disabled', false);
                toElement.css({
                    'background-color': '#ffffff',
                    'cursor': 'pointer',
                    'opacity': '1'
                });
                toElement.datepicker('option', 'minDate', selectedDate);
                toElement.datepicker('option', 'disabled', false);
            },

            disableEnd(toElement) {
                toElement.prop('disabled', true);
                toElement.css({
                    'background-color': '#e9ecef',
                    'cursor': 'not-allowed',
                    'opacity': '0.6'
                });
                toElement.val('');
                toElement.datepicker('option', 'disabled', true);
            },

            checkEndDateValidity(toElement, selectedDate) {
                var endDate = toElement.val();
                if (endDate) {
                    var endDateObj = $.datepicker.parseDate(CONFIG.DATE_FORMAT, endDate);
                    if (endDateObj < selectedDate) {
                        toElement.val('');
                        Utils.log('Date de fin réinitialisée', 'checkEndDateValidity', 1);
                    }
                }
            },

            validateEndDate(fromElement, toElement, selectedDate) {
                var beginDate = fromElement.val();
                if (beginDate) {
                    var beginDateObj = $.datepicker.parseDate(CONFIG.DATE_FORMAT, beginDate);
                    if (beginDateObj > selectedDate) {
                        toElement.val('');
                        TokenManager.set('modal_header', 'ERREUR');
                        TokenManager.set('modal_content', 'La date de fin ne peut pas être inférieure à la date de début.');
                        $('#modal_link')[0].click();
                    }
                }
            },

            getDate(element) {
                try {
                    return $.datepicker.parseDate(CONFIG.DATE_FORMAT, element.value);
                } catch (error) {
                    return null;
                }
            }
        };

        // ==================== SPINNER DE CHARGEMENT ====================
        const LoadSpinner = {
            state(state) {
                if ($('#loadSpinner').length == 0) {
                    console.log('%c LoadSpinner: div inexistante', 'background: #222; color: #FF0000');
                    return;
                }

                if (state == 'ON') {
                    if ($('#loadSpinner_circle').length != 0) return;
                    
                    var msg = $('#loadSpinner').attr('loading_msg') || 'Chargement en cours';
                    var color = $('#loadSpinner').attr('circle_color') || '#FF0000';
                    
                    var style = `
                        #loadSpinner_circle {
                            margin: 0 auto;
                            border: 5px solid transparent;
                            border-top: 5px solid ${color};
                            border-radius: 50%;
                            width: 50px;
                            height: 50px;
                            animation: spin 1s linear infinite;
                        }
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                        .progress-bar { visibility: hidden!important; }
                    `;
                    
                    $('#loadSpinner').append('<style>' + style + '</style>');
                    $('#loadSpinner').append('<center><div id="loadSpinner_msg">' + msg + '</div></center>');
                    $('#loadSpinner').append('<center><div id="loadSpinner_circle"/></center>');
                } else {
                    $('#loadSpinner').html('');
                }
            },

            changeMsg(text) {
                if ($('#loadSpinner_msg').length != 0) {
                    $('#loadSpinner_msg').html(text);
                }
            }
        };

        // ==================== INTERFACE UTILISATEUR ====================
        const UIManager = {
            create() {
                if (Utils.isNotNull($('#downtime > .Omni_base').val())) {
                    Utils.log('', 'UI déjà existante');
                    return;
                }

                var userName = Splunk.util.getConfigValue('USERNAME');
                var dashboardType = $('#dashboardType').html();
                
                if (dashboardType === 'delete') {
                    var html = `
                        <div class="ui Omni_base">
                            <table id="Omni_table">
                                <tr><td width="100%">
                                    <div class="ui small form segment Omni_segment">
                                        <h3>Commentaire de suppression</h3>
                                        <p style="color: #666; margin-bottom: 10px;">Veuillez indiquer la raison de la suppression de cette maintenance</p>
                                    </div>
                                    <textarea class="Omni_commentaire" id="commentaire" cols="300" rows="3" placeholder="Raison de la suppression (obligatoire)"></textarea>
                                </td></tr>
                            </table>
                            <input id="CANCEL_button" type="button" value="Annuler" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">
                            <input id="VALID_button" type="button" value="Confirmer la suppression" style="padding: 5px 10px; border-radius: 4px; background-color: #d9534f" class="btn-primary Omni_button">
                            ${debugMode == '1' ? '<input id="TEST_button" type="button" value="Test" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">' : ''}
                            <br/>
                            <center><div id="loadSpinner" loading_msg=" " circle_color="#A64764" /></center>
                        </div>
                    `;
                    
                    $('#downtime').html(html);
                    $('#username').html(userName);
                    return;
                }
                
                var html = `
                    <div class="ui Omni_base">
                        <table id="Omni_table">
                            <tr><td width="100%">
                                <div class="ui small form segment Omni_segment">
                                    <div id="tabs">
                                        <div class="ui menu tabsName Omni_tabsName">
                                            <div class="ui label blue item Omni_itemName"></div>
                                            <a class="item tabx" id="tAdd"></a>
                                        </div>
                                    </div>
                                    <div id="content" class="Omni_content"></div>
                                </div>
                                <label>Commentaire ou numéro de ticket</label>
                            </td></tr>
                            <tr><td>
                                <textarea class="Omni_commentaire" id="commentaire" cols="300" rows="3"></textarea>
                            </td></tr>
                        </table>
                        <input id="CANCEL_button" type="button" value="Annuler" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">
                        <input id="VALID_button" type="button" value="Valider" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">
                        ${debugMode == '1' ? '<input id="TEST_button" type="button" value="Test" style="padding: 5px 10px; border-radius: 4px" class="btn-primary Omni_button">' : ''}
                        <br/>
                        <center><div id="loadSpinner" loading_msg=" " circle_color="#A64764" /></center>
                    </div>
                `;
                
                $('#downtime').html(html);
                $('#username').html(userName);
            },

            populateCustomFilterForm(parsedFilter) {
                Utils.log(parsedFilter, 'populateCustomFilterForm');
                
                if (!parsedFilter || !parsedFilter.expression1) {
                    return;
                }
                
                // Expression 1
                if (parsedFilter.hasNot1) {
                    TokenManager.set('not_1', 'NOT', true);
                } else {
                    //  FIX : Unset explicite au lieu de laisser undefined
                    TokenManager.unset('not_1');
                    TokenManager.set('not_1', '', true);  // Définir comme chaîne vide
                }
                
                var fieldName1 = parsedFilter.expression1.field || '';
                TokenManager.set('field_name_1', fieldName1, true);
                
                var fieldType1 = 'string';
                var op1Key = parsedFilter.expression1.operatorKey;
                if (['EQUAL_NUM', 'NOT_EQUAL_NUM', 'LTE', 'GTE', 'LT', 'GT'].indexOf(op1Key) !== -1) {
                    fieldType1 = 'number';
                }
                TokenManager.set('field_type_1', fieldType1, true);
                
                var operator1Value = UIManager.convertOperatorKeyToDropdownValue(op1Key);
                TokenManager.set('field_operator_1', operator1Value, true);
                
                var fieldValue1 = parsedFilter.expression1.value || '';
                TokenManager.set('field_value_1', fieldValue1, true);
                
                // Expression 2
                if (parsedFilter.expression2) {
                    TokenManager.set('show_custom_field_sup', '1', true);
                    TokenManager.set('field_sup', '1');
                    
                    var logicalOp = parsedFilter.logicalOperator || 'AND';
                    TokenManager.set('operator', logicalOp, true);
                    
                    if (parsedFilter.hasNot2) {
                        TokenManager.set('not_2', 'NOT', true);
                    } else {
                        //  FIX : Unset explicite
                        TokenManager.unset('not_2');
                        TokenManager.set('not_2', '', true);  // Définir comme chaîne vide
                    }
                    
                    var fieldName2 = parsedFilter.expression2.field || '';
                    TokenManager.set('field_name_2', fieldName2, true);
                    
                    var fieldType2 = 'string';
                    var op2Key = parsedFilter.expression2.operatorKey;
                    if (['EQUAL_NUM', 'NOT_EQUAL_NUM', 'LTE', 'GTE', 'LT', 'GT'].indexOf(op2Key) !== -1) {
                        fieldType2 = 'number';
                    }
                    TokenManager.set('field_type_2', fieldType2, true);
                    
                    var operator2Value = UIManager.convertOperatorKeyToDropdownValue(op2Key);
                    TokenManager.set('field_operator_2', operator2Value, true);
                    
                    var fieldValue2 = parsedFilter.expression2.value || '';
                    TokenManager.set('field_value_2', fieldValue2, true);
                } else {
                    TokenManager.unset('show_custom_field_sup');
                    TokenManager.set('field_sup', '0');
                    
                    //  FIX : Initialiser not_2 même si pas d'expression 2
                    TokenManager.unset('not_2');
                    TokenManager.set('not_2', '', true);
                }
                
                Utils.log('Tokens définis avec succès', 'populateCustomFilterForm');
            },

            convertOperatorKeyToDropdownValue(operatorKey) {
                var mapping = {
                    'EQUAL_NUM': '=',
                    'NOT_EQUAL_NUM': '!=',
                    'LTE': '<=',
                    'GTE': '>=',
                    'LT': '<',
                    'GT': '>',
                    'ISNULL': 'isnull()',
                    'ISNOTNULL': 'isnotnull()',
                    'EQUAL_STR': '=',
                    'NOT_EQUAL_STR': '!=',
                    'LIKE_CONTAINS': 'LIKE',
                    'LIKE_STARTS': 'LIKEC',
                    'LIKE_ENDS': 'LIKEF'
                };
                
                return mapping[operatorKey] || '=';
            },

            appendPeriodTab(tab, nombre, downtimeType = 'between_date', beginDays = '', beginHours = '00:00:00', endDays = '', endHours = '24:00:00') {
                Utils.log([tab, nombre, downtimeType], 'appendPeriodTab');

                var checks = {
                    between_date: downtimeType == 'between_date' ? 'checked="checked"' : '',
                    weekly: downtimeType == 'weekly' ? 'checked="checked"' : '',
                    monthly: downtimeType == 'monthly' ? 'checked="checked"' : '',
                    special_date: UIManager.cutStringForSpecialDate(downtimeType) == 'special_date' ? 'checked="checked"' : ''
                };

                var base = 'tab-Periode' + numberTabs.toString();
                var n = nombre || 'tab ' + numberTabs.toString();
                var tn = nombre ? nombre.replace(/\s/g, '') : 'tab' + numberTabs.toString();

                $('.tab-content').removeClass('current');

                var form = `
                    <div>
                        <form id="form-${base}" class="radiobasis">
                            Date à date <input type="radio" periodID="radioD" name="basis-${base}" value="between_date" ${checks.between_date}>${CONFIG.SPACING}
                            Hebdomadaire <input type="radio" periodID="radioW" name="basis-${base}" value="weekly" ${checks.weekly}>${CONFIG.SPACING}
                            Mensuel <input type="radio" periodID="radioM" name="basis-${base}" value="monthly" ${checks.monthly}>${CONFIG.SPACING}
                            Spécifique <input type="radio" periodID="radioS" name="basis-${base}" value="special_date" ${checks.special_date}>
                        </form>
                    </div><br />
                `;

                var content = `
                    <div id="content-${base}" class="tab-content current">
                        ${form}
                        <div id="table-${base}">
                            ${UIManager.createPeriodContent(base, downtimeType, beginDays, beginHours, endDays, endHours)}
                        </div>
                    </div>
                `;

                numberTabs++;
                
                if (!$('#tab-' + tn).length) {
                    $('#content').append(content);
                    var t = $('#' + tab + ' .tabsName');
                    t.find('#tAdd').remove();
                    
                    var tabItem = `
                        <a class="item tab" data-tab="${tn}" id="tab-${tn}">
                            ${n} <i class="times icon btnx" id="btnx-${tn}"></i>
                        </a>
                        <a class="item tabx" id="tAdd"><i class="add square icon"></i></a>
                    `;
                    t.append(tabItem);
                }
                $('#tab-' + tn).click();
            },

            createPeriodContent(name, choice, beginDays = '', beginHours = '00:00:00', endDays = '', endHours = '24:00:00') {
                beginHours = beginHours.substr(0, 5);
                endHours = endHours.substr(0, 5);
                
                if (choice == 'between_date') {
                    return UIManager.createBetweenDateContent(name, beginDays, beginHours, endDays, endHours);
                } else if (choice == 'weekly') {
                    return UIManager.createWeeklyContent(name, beginDays, beginHours, endHours);
                } else if (choice == 'monthly') {
                    return UIManager.createMonthlyContent(name, beginDays, beginHours, endHours);
                } else if (UIManager.cutStringForSpecialDate(choice) == 'special_date') {
                    return UIManager.createSpecialDateContent(name, beginDays, beginHours, endHours, choice);
                }
                return '';
            },

            createBetweenDateContent(name, beginDays, beginHours, endDays, endHours) {
                return `
                    <div><table id="omni_periode">
                        <tr>
                            <td>Date de début</td>
                            <td><input type="text" id="datepicker_begin-${name}" readonly value="${beginDays}"></td>
                            <td>Heure de début</td>
                            <td><input type="text" id="begin${name}" class="inputPeriodBegin" name="begin" required minlength="5" maxlength="5" size="7" value="${beginHours}"></td>
                        </tr>
                        <tr>
                            <td>Date de fin</td>
                            <td><input type="text" id="datepicker_end-${name}" readonly value="${endDays}"></td>
                            <td>Heure de fin</td>
                            <td><input type="text" id="end${name}" class="inputPeriodEnd" name="end" required minlength="5" maxlength="5" size="7" value="${endHours}"></td>
                        </tr>
                    </table></div>
                `;
            },

            createWeeklyContent(name, beginDays, beginHours, endHours) {
                var daysHtml = CONFIG.WEEK_DAYS.map(day => 
                    `<li class="ui-state-default${UIManager.matchDays(beginDays, day, ' ui-selected')}">${day}</li>`
                ).join('');

                return `
                    <div><table id="omni_periode">
                        <tr>
                            <td>Jours</td>
                            <td><ol id="selectable_1-${name}">${daysHtml}</ol></td>
                        </tr>
                        <tr>
                            <td>Période de temps</td>
                            <td>
                                <table>
                                    <tr><td>Début</td><td><input type="text" id="begin${name}" class="inputPeriodBegin" name="begin" required minlength="5" maxlength="5" size="7" value="${beginHours}"></td></tr>
                                    <tr><td>Fin</td><td><input type="text" id="end${name}" class="inputPeriodEnd" name="end" required minlength="5" maxlength="5" size="7" value="${endHours}"></td></tr>
                                </table>
                            </td>
                        </tr>
                    </table></div>
                `;
            },

            createMonthlyContent(name, beginDays, beginHours, endHours) {
                var daysHtml = CONFIG.MONTH_DAYS.map(day => 
                    `<li class="ui-state-default${UIManager.matchDays(beginDays, day, ' ui-selected')}">${day}</li>`
                ).join('');

                return `
                    <div><table>
                        <tr>
                            <td>Jours</td>
                            <td>
                                <table width=450>
                                    <tr><td><ol id="selectable_list-${name}">${daysHtml}</ol></td></tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td>Période de temps</td>
                            <td>
                                <table>
                                    <tr><td>Début</td><td><input type="text" size="7" id="begin${name}" class="inputPeriodBegin" name="begin" value="${beginHours}"></td></tr>
                                    <tr><td>Fin</td><td><input type="text" size="7" id="end${name}" class="inputPeriodEnd" name="end" value="${endHours}"></td></tr>
                                </table>
                            </td>
                        </tr>
                    </table></div>
                `;
            },

            createSpecialDateContent(name, beginDays, beginHours, endHours, choice) {
                var dayOptions = CONFIG.WEEK_DAYS.map(day => 
                    `<option value="${day}" ${UIManager.matchDays(beginDays, day, 'selected')}>${day}</option>`
                ).join('');

                var typeOptions = [
                    ['first', 'special_date_first_in_month', 'Premier du mois'],
                    ['second', 'special_date_second_in_month', 'Deuxieme du mois'],
                    ['third', 'special_date_third_in_month', 'Troisieme du mois'],
                    ['fourth', 'special_date_fourth_in_month', 'Quatrieme du mois'],
                    ['last', 'special_date_last_in_month', 'Dernier du mois']
                ].map(([value, key, label]) => 
                    `<option value="${value}" ${UIManager.matchDays(choice, key, 'selected')}>${label}</option>`
                ).join('');

                return `
                    <div><table>
                        <tr>
                            <td>Jours</td>
                            <td>
                                <select id="select_day" name="select_day">${dayOptions}</select>&nbsp;
                                <select id="select_type" name="select_type">${typeOptions}</select>
                            </td>
                        </tr>
                        <tr><td>Période de temps</td></tr>
                        <table>
                            <tr><td>Début</td><td><input type="text" size="7" id="begin${name}" class="inputPeriodBegin" name="begin" value="${beginHours}"></td></tr>
                            <tr><td>Fin</td><td><input type="text" size="7" id="end${name}" class="inputPeriodEnd" name="end" value="${endHours}"></td></tr>
                        </table>
                    </table></div>
                `;
            },

            cutStringForSpecialDate(text) {
                if (Utils.isNull(text)) return '';
                return text.length > 12 ? text.substr(0, 12) : text;
            },

            matchDays(text, day, result) {
                try {
                    var found = text.match(day);
                    if (Utils.isNotNull(found) && found[0] == day) {
                        return result;
                    }
                } catch (error) {
                    return '';
                }
                return '';
            },

            buildPeriodsDescriptionFromSource() {
                var periodsHtml = '';
                var dashboardType = $('#dashboardType').html();
                
                Utils.log('Début buildPeriodsDescriptionFromSource', 'buildPeriodsDescriptionFromSource');
                Utils.log(dashboardType, 'Dashboard type');
                
                if (dashboardType === 'delete' || dashboardType === 'update_custom') {
                    var downtimeSelected = TokenManager.get('downtime_selected');
                    
                    if (Utils.isNull(downtimeSelected)) {
                        Utils.log('Aucun downtime sélectionné', 'buildPeriodsDescriptionFromSource', 1);
                        return '';
                    }
                    
                    try {
                        var downtimeJson = JSON.parse(downtimeSelected);
                        
                        if (!Array.isArray(downtimeJson)) {
                            downtimeJson = [downtimeJson];
                        }
                        
                        Utils.log(downtimeJson, 'Downtime JSON parsé');
                        
                        downtimeJson.forEach((period, index) => {
                            var periodNumber = index + 1;
                            var periodType = '';
                            var periodDesc = '';
                            
                            if (period.dt_type === 'between_date') {
                                periodType = 'Date à date';
                                periodDesc = `Du <strong>${period.begin_date} ${period.begin_time.substr(0, 5)}</strong> au <strong>${period.end_date} ${period.end_time.substr(0, 5)}</strong>`;
                            } 
                            else if (period.dt_type === 'weekly') {
                                periodType = 'Hebdomadaire';
                                var days = period.begin_date.split(';').join(', ');
                                periodDesc = `Les <strong>${days}</strong> de <strong>${period.begin_time.substr(0, 5)}</strong> à <strong>${period.end_time.substr(0, 5)}</strong>`;
                            }
                            else if (period.dt_type === 'monthly') {
                                periodType = 'Mensuel';
                                var days = period.begin_date.split(';').join(', ');
                                periodDesc = `Les jours <strong>${days}</strong> de <strong>${period.begin_time.substr(0, 5)}</strong> à <strong>${period.end_time.substr(0, 5)}</strong>`;
                            }
                            else if (period.dt_type.startsWith('special_date_')) {
                                periodType = 'Spécifique';
                                var specialType = period.dt_type.replace('special_date_', '').replace('_in_month', '');
                                var typeLabels = {
                                    'first': 'Premier du mois',
                                    'second': 'Deuxième du mois',
                                    'third': 'Troisième du mois',
                                    'fourth': 'Quatrième du mois',
                                    'last': 'Dernier du mois'
                                };
                                var typeLabel = typeLabels[specialType] || specialType;
                                periodDesc = `<strong>${typeLabel}</strong> <strong>${period.begin_date}</strong> de <strong>${period.begin_time.substr(0, 5)}</strong> à <strong>${period.end_time.substr(0, 5)}</strong>`;
                            }
                            
                            var additionalInfo = '';
                            if (period.dt_filter && period.dt_filter !== '') {
                                additionalInfo += `<br/><span style="padding-left: 40px; font-size: 0.9em; color: #666;">Filter: <em>${period.dt_filter}</em></span>`;
                            }
                            if (period.dt_pattern && period.dt_pattern !== '') {
                                additionalInfo += `<br/><span style="padding-left: 40px; font-size: 0.9em; color: #666;">Pattern: <em>${period.dt_pattern}</em></span>`;
                            }
                            if (period.id && period.id !== '') {
                                additionalInfo += `<br/><span style="padding-left: 40px; font-size: 0.9em; color: #999;">ID: <code>${period.id}</code></span>`;
                            }
                            
                            periodsHtml += `
                                <tr>
                                    <td style="padding-left: 20px; vertical-align: top;"><em>Période ${periodNumber}</em></td>
                                    <td></td>
                                    <td>
                                        <span class="description_item">${periodType}</span> ${periodDesc}
                                        ${additionalInfo}
                                    </td>
                                </tr>
                            `;
                        });
                        
                    } catch (error) {
                        Utils.log(error, 'Erreur lors du parsing du JSON downtime', 2);
                        console.error('Erreur complète:', error);
                        
                        // Fallback
                        try {
                            var allPeriods = downtimeSelected.split('£');
                            Utils.log(allPeriods, 'Tentative avec l\'ancien format');
                            
                            allPeriods.forEach((period, index) => {
                                var periodValue = period.split('#');
                                var periodNumber = index + 1;
                                
                                if (periodValue.length >= 5) {
                                    var periodType = periodValue[0];
                                    var beginDay = periodValue[1];
                                    var endDay = periodValue[2];
                                    var beginHour = periodValue[3].substr(0, 5);
                                    var endHour = periodValue[4].substr(0, 5);
                                    
                                    var typeLabel = '';
                                    var desc = '';
                                    
                                    if (periodType === 'between_date') {
                                        typeLabel = 'Date à date';
                                        desc = `Du <strong>${beginDay} ${beginHour}</strong> au <strong>${endDay} ${endHour}</strong>`;
                                    } else if (periodType === 'weekly') {
                                        typeLabel = 'Hebdomadaire';
                                        desc = `Les <strong>${beginDay}</strong> de <strong>${beginHour}</strong> à <strong>${endHour}</strong>`;
                                    } else if (periodType === 'monthly') {
                                        typeLabel = 'Mensuel';
                                        desc = `Les jours <strong>${beginDay}</strong> de <strong>${beginHour}</strong> à <strong>${endHour}</strong>`;
                                    } else if (periodType.startsWith('special_date_')) {
                                        typeLabel = 'Spécifique';
                                        desc = `<strong>${periodType.replace('special_date_', '').replace('_in_month', '')}</strong> <strong>${beginDay}</strong> de <strong>${beginHour}</strong> à <strong>${endHour}</strong>`;
                                    }
                                    
                                    periodsHtml += `
                                        <tr>
                                            <td style="padding-left: 20px;"><em>Période ${periodNumber}</em></td>
                                            <td></td>
                                            <td><span class="description_item">${typeLabel}</span> ${desc}</td>
                                        </tr>
                                    `;
                                }
                            });
                        } catch (fallbackError) {
                            Utils.log(fallbackError, 'Erreur également dans le fallback', 2);
                            return '';
                        }
                    }
                    
                } else {
                    // Mode ADD/UPDATE
                    var periodNumber = 1;
                    
                    $('[id^=content-tab-Period]').each(function() {
                        var periodDesc = '';
                        var periodType = '';
                        
                        if ($(this).find('[periodID=radioD]').is(':checked')) {
                            var dateBegin = $(this).find('[id^=datepicker_begin]').val();
                            var dateEnd = $(this).find('[id^=datepicker_end]').val();
                            var timeBegin = $(this).find('.inputPeriodBegin').val();
                            var timeEnd = $(this).find('.inputPeriodEnd').val();
                            
                            if (dateBegin && dateEnd) {
                                periodType = 'Date à date';
                                periodDesc = `Du <strong>${dateBegin} ${timeBegin}</strong> au <strong>${dateEnd} ${timeEnd}</strong>`;
                            }
                        } 
                        else if ($(this).find('[periodID=radioW]').is(':checked')) {
                            var days = [];
                            $(this).find('.ui-selected').each(function() {
                                days.push($(this).html());
                            });
                            var timeBegin = $(this).find('.inputPeriodBegin').val();
                            var timeEnd = $(this).find('.inputPeriodEnd').val();
                            
                            if (days.length > 0) {
                                periodType = 'Hebdomadaire';
                                periodDesc = `Les <strong>${days.join(', ')}</strong> de <strong>${timeBegin}</strong> à <strong>${timeEnd}</strong>`;
                            }
                        }
                        else if ($(this).find('[periodID=radioM]').is(':checked')) {
                            var days = [];
                            $(this).find('.ui-selected').each(function() {
                                days.push($(this).html());
                            });
                            var timeBegin = $(this).find('.inputPeriodBegin').val();
                            var timeEnd = $(this).find('.inputPeriodEnd').val();
                            
                            if (days.length > 0) {
                                periodType = 'Mensuel';
                                periodDesc = `Les jours <strong>${days.join(', ')}</strong> de <strong>${timeBegin}</strong> à <strong>${timeEnd}</strong>`;
                            }
                        }
                        else if ($(this).find('[periodID=radioS]').is(':checked')) {
                            var day = $(this).find('#select_day').val();
                            var type = $(this).find('#select_type option:selected').text();
                            var timeBegin = $(this).find('.inputPeriodBegin').val();
                            var timeEnd = $(this).find('.inputPeriodEnd').val();
                            
                            if (day && type) {
                                periodType = 'Spécifique';
                                periodDesc = `<strong>${type}</strong> <strong>${day}</strong> de <strong>${timeBegin}</strong> à <strong>${timeEnd}</strong>`;
                            }
                        }
                        
                        if (periodDesc !== '') {
                            periodsHtml += `
                                <tr>
                                    <td style="padding-left: 20px;"><em>Période ${periodNumber}</em></td>
                                    <td></td>
                                    <td><span class="description_item">${periodType}</span> ${periodDesc}</td>
                                </tr>
                            `;
                            periodNumber++;
                        }
                    });
                }
                
                Utils.log(periodsHtml, 'Périodes HTML générées');
                return periodsHtml;
            },

            updateDescriptionDiv() {
                var service_selected = TokenManager.get('service_selected');
                var kpi_selected = TokenManager.get('kpi_selected');
                var entity_selected = TokenManager.get('entity_selected');
                var dt_filterToken = TokenManager.get('dt_filter_selected') || '';
                var dt_patternToken = TokenManager.get('dt_pattern_selected') || '';
                var dt_id = TokenManager.get('DT_ID') || '';
                var dashboardType = $('#dashboardType').html();
                
                Utils.log('updateDescriptionDiv appelé', 'updateDescriptionDiv');
                Utils.log({dashboardType: dashboardType, dt_id: dt_id}, 'Contexte');
                
                var selectionDescHtml = `
                    <table id="selection_desc_table" width="100%">
                        <tr><td width="150"><strong>ID Downtime</strong></td><td width="20"></td><td><span class="description_item">${dt_id}</span></td></tr>
                        <tr><td><strong>Service(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(service_selected)}</td></tr>
                        <tr><td><strong>KPI(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(kpi_selected)}</td></tr>
                        <tr><td><strong>Entity(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(entity_selected)}</td></tr>
                `;
                
                if (Utils.isNotNull(dt_filterToken) && dt_filterToken !== '') {
                    selectionDescHtml += `<tr><td><strong>Custom filter(s)</strong></td><td></td><td><code style="background: #f5f5f5; padding: 2px 5px;">${dt_filterToken}</code></td></tr>`;
                }
                
                if (Utils.isNotNull(dt_patternToken) && dt_patternToken !== '') {
                    selectionDescHtml += `<tr><td><strong>Pattern(s)</strong></td><td></td><td>${TextTransformer.toVisualTags(dt_patternToken)}</td></tr>`;
                }
                
                var periodsHtml = UIManager.buildPeriodsDescriptionFromSource();
                if (periodsHtml !== '') {
                    var periodTitle = dashboardType === 'delete' 
                        ? 'Périodes de maintenance à supprimer :' 
                        : 'Périodes de maintenance :';
                    selectionDescHtml += `<tr><td colspan="3"><br/><strong>${periodTitle}</strong></td></tr>`;
                    selectionDescHtml += periodsHtml;
                }
                
                selectionDescHtml += `<tr></tr></table>`;

                if (Utils.isNotNull(selectionDescHtml)) {
                    $('#selection_desc').html(selectionDescHtml);
                }
            }
        };

        // ==================== GESTION DES REQUÊTES ====================
        const QueryBuilder = {
            withDowntimeID(downtimeID) {
                return `| inputlookup omni_kv_def where ID="${downtimeID}"
                    | rename _key as key
                    | rex field=step_opt "(?<service_type>.)(?<kpi_type>.)(?<entity_type>.)"
                    | eval downtime=mvjoin(downtime,"£"),
                        service=mvjoin(service,";"),
                        kpi=mvjoin(kpi,";"),
                        entity=mvjoin(entity,";")
                    | table key,downtime,service_type,service,kpi_type,kpi,entity_type,entity,dt_filter,dt_pattern,commentary,version`;
            },

            createAdd(arr) {
                return QueryBuilder.createQuery(arr, 'add');
            },

            createUpdate(arr) {
                return QueryBuilder.createQuery(arr, 'update');
            },

            createDelete(arr) {
                return QueryBuilder.createQuery(arr, 'delete');
            },

            createQuery(arr, action) {
                try {
                    Utils.log('Début createQuery', 'QueryBuilder');
                    Utils.log({arr: arr, action: action}, 'Paramètres createQuery');
                    
                    var dt_update = new Date().getTime();
                    var array_status = arr['downtimeFields'].map(() => action === 'delete' ? 'disabled' : 'enabled');
                    
                    Utils.log(arr['downtimeFields'], 'downtimeFields avant transformation');
                    
                    var downtimeJsonArray = arr['downtimeFields'].map((field, index) => {
                        var parts = field.split('#');
                        return {
                            id: arr['ID'] + '_' + (index + 1),
                            dt_type: parts[CONFIG.PERIOD_FIELDS.TYPE] || '',
                            begin_date: parts[CONFIG.PERIOD_FIELDS.BEGIN_DAY] || '',
                            end_date: parts[CONFIG.PERIOD_FIELDS.END_DAY] || '',
                            begin_time: parts[CONFIG.PERIOD_FIELDS.BEGIN_HOUR] || '',
                            end_time: parts[CONFIG.PERIOD_FIELDS.END_HOUR] || '',
                            dt_filter: arr['dt_filter'] || '',
                            dt_pattern: arr['dt_pattern'] || ''
                        };
                    });
                    
                    Utils.log(downtimeJsonArray, 'downtimeJsonArray créé');
                    
                    var downtimeJsonString = JSON.stringify(downtimeJsonArray);
                    Utils.log(downtimeJsonString, 'JSON string avant échappement');
                    
                    downtimeJsonString = downtimeJsonString
                        .replace(/\\/g, '\\\\')
                        .replace(/"/g, '\\"');
                    
                    Utils.log(downtimeJsonString, 'JSON string après échappement');
                    
                    var baseQuery = `| stats count as service
            | eval service=split("${Utils.escapeSPLString(arr['service'])}",";"),
                kpi=split("${Utils.escapeSPLString(arr['kpi'])}",";"),
                entity=split("${Utils.escapeSPLString(arr['entity'])}",";"),
                dt_filter="${Utils.escapeSPLString(arr['dt_filter'])}",
                dt_pattern="${Utils.escapeSPLString(arr['dt_pattern'] || '')}",
                downtime="${downtimeJsonString}",
                creator="${Utils.escapeSPLString(arr['username'])}",
                commentary="${Utils.escapeSPLString(arr['commentary'])}",
                version="${arr['version']}",
                ID="${arr['ID']}",
                dt_update=${dt_update},
                step_opt="${arr['step_opt']}",
                status=split("${array_status}",",")`;

                    if (action !== 'add') {
                        baseQuery = `| stats count as service
            | eval key="${arr['key']}",
                service=split("${Utils.escapeSPLString(arr['service'])}",";"),
                kpi=split("${Utils.escapeSPLString(arr['kpi'])}",";"),
                entity=split("${Utils.escapeSPLString(arr['entity'])}",";"),
                dt_filter="${Utils.escapeSPLString(arr['dt_filter'])}",
                dt_pattern="${Utils.escapeSPLString(arr['dt_pattern'] || '')}",
                downtime="${downtimeJsonString}",
                creator="${Utils.escapeSPLString(arr['username'])}",
                commentary="${Utils.escapeSPLString(arr['commentary'])}",
                version="${arr['version']}",
                ID="${arr['ID']}",
                dt_update=${dt_update},
                step_opt="${arr['step_opt']}",
                status=split("${array_status}",",")`;
                    }
                    
                    var finalQuery = `${baseQuery} | OmniKVUpdate action="${action}" ${arr['sendEmail']}`;
                    
                    Utils.log(finalQuery, '=== QUERY FINALE GÉNÉRÉE ===', 0);
                    
                    return finalQuery;
                    
                } catch (error) {
                    Utils.log(error, 'ERREUR CRITIQUE dans createQuery', 2);
                    console.error('Stack trace:', error.stack);
                    throw error;
                }
            }
        };

        // ==================== GESTION DES DONNÉES ====================
        const DataManager = {
        fillDashboard(downtimeData, dashboardType) {
            Utils.log([downtimeData, dashboardType], 'fillDashboard');
            downtimeData.forEach(function (row) {
                Utils.log(row, 'ROW');
                var service = row[CONFIG.DOWNTIME_FIELDS.SERVICE];
                var kpi = row[CONFIG.DOWNTIME_FIELDS.KPI];
                var entity = row[CONFIG.DOWNTIME_FIELDS.ENTITY];
                var dt_filter = row[CONFIG.DOWNTIME_FIELDS.DT_FILTER];
                var dt_pattern = row[CONFIG.DOWNTIME_FIELDS.DT_PATTERN] || '';
                var service_type = row[CONFIG.DOWNTIME_FIELDS.SERVICE_TYPE];
                var kpi_type = row[CONFIG.DOWNTIME_FIELDS.KPI_TYPE];
                var entity_type = row[CONFIG.DOWNTIME_FIELDS.ENTITY_TYPE];
                var downtime = row[CONFIG.DOWNTIME_FIELDS.DOWNTIME];
                var commentary = row[CONFIG.DOWNTIME_FIELDS.COMMENTARY];

                TokenManager.set('selected_version', row[CONFIG.DOWNTIME_FIELDS.VERSION]);
                TokenManager.set('key', row[CONFIG.DOWNTIME_FIELDS.KEY]);
                
                DataManager.setTypeTokens('service', service, service_type, dashboardType);
                DataManager.setTypeTokens('kpi', kpi, kpi_type, dashboardType);
                DataManager.setTypeTokens('entity', entity, entity_type, dashboardType);
                TokenManager.set('dt_filter', dt_filter);
                TokenManager.set('dt_filter_selected', dt_filter);
                TokenManager.set('dt_pattern', dt_pattern);
                
                if (dashboardType == "update") {
                    if (Utils.isNotNull(dt_pattern) && dt_pattern !== '') {
                        TokenManager.set('pattern_type', 'exist', true);
                        TokenManager.set('pattern_exist', '1');
                        TokenManager.set('dt_pattern_select', dt_pattern, true);
                        TokenManager.set('dt_pattern_selected', dt_pattern);
                        
                        Utils.log('Pattern initialisé en mode "exist": ' + dt_pattern, 'fillDashboard - Pattern');
                    } else {
                        TokenManager.set('pattern_type', 'new', true);
                        TokenManager.set('pattern_new', '1');
                        TokenManager.set('dt_pattern_selected', '');
                        
                        Utils.log('Pattern initialisé en mode "new" (vide)', 'fillDashboard - Pattern');
                    }
                    
                    DataManager.updatePeriods(downtime, commentary);
                    TokenManager.set('update_full_loading', 1);
                } else if (dashboardType == "delete") {
                    TokenManager.set("downtime_selected", downtime);
                    try {
                        $('#commentaire').val(commentary);
                    } catch (error) {
                        Utils.log(error, 'unable to write in #commentaire', 1);
                    }
                    UIManager.updateDescriptionDiv();
                    TokenManager.set('update_full_loading', 1);
                    TokenManager.set('step_opt_for_delete', service_type.toString() + kpi_type.toString() + entity_type.toString());
                 } else if (dashboardType == "update_custom") {
                        Utils.log('Mode UPDATE_CUSTOM détecté', 'fillDashboard');
                        
                        TokenManager.set("downtime_selected", downtime);
                        // TokenManager.set('step_opt_for_delete', service_type.toString() + kpi_type.toString() + entity_type.toString());
                        
                        // FIX : Initialisation du pattern (copié depuis le mode update)
                        if (Utils.isNotNull(dt_pattern) && dt_pattern !== '') {
                            TokenManager.set('pattern_type', 'exist', true);
                            TokenManager.set('pattern_exist', '1');
                            TokenManager.set('dt_pattern_select', dt_pattern, true);
                            TokenManager.set('dt_pattern_selected', dt_pattern);
                            
                            Utils.log('Pattern initialisé en mode "exist": ' + dt_pattern, 'fillDashboard - Pattern');
                        } else {
                            TokenManager.set('pattern_type', 'new', true);
                            TokenManager.set('pattern_new', '1');
                            TokenManager.set('dt_pattern_selected', '');
                            
                            Utils.log('Pattern initialisé en mode "new" (vide)', 'fillDashboard - Pattern');
                        }
                        
                        var parsedFilter = CustomFilterParser.parse(dt_filter);
                        Utils.log(parsedFilter, 'Filtre parsé');
                        
                        UIManager.populateCustomFilterForm(parsedFilter);
                        
                        try {
                            $('#commentaire').val(commentary);
                        } catch (error) {
                            Utils.log(error, 'unable to write in #commentaire', 1);
                        }
                        
                        DataManager.updatePeriods(downtime, commentary);
                        TokenManager.set('update_full_loading', 1);
                    }
            });
        },

            setTypeTokens(prefix, value, type, dashboardType) {
                TokenManager.set(prefix + '_selected', value);
                TokenManager.set(prefix + '_select_input_type', type, CONFIG.UPDATE_FORM);
                
                if (type == 2 && (dashboardType == "update" || dashboardType == "update_custom")) {
                    TokenManager.set(prefix + '_for_concat', value.replace(';', ','));
                    TokenManager.set(prefix + '_concat', value, CONFIG.UPDATE_FORM);
                    TokenManager.set(prefix + '_select_dual', '  ');
                } else {
                    TokenManager.unset(prefix + '_select_dual');
                    if (type == 3) {
                        TokenManager.set(prefix + '_text_selected', value, CONFIG.UPDATE_FORM);
                    }
                }
            },

            updatePeriods(text, commentary) {
                var dashboardType = $('#dashboardType').html();
                
                Utils.log({text: text, commentary: commentary, dashboardType: dashboardType}, 'updatePeriods - START');
                
                if (dashboardType === 'delete') {
                    Utils.log('Mode delete - stockage des données seulement', 'updatePeriods');
                    TokenManager.set('downtime_selected', text);
                    
                    try {
                        $('#commentaire').val(commentary);
                    } catch (error) {
                        Utils.log(error, 'unable to write in #commentaire', 1);
                    }
                    
                    UIManager.updateDescriptionDiv();
                    return;
                }
                
               
                UIManager.create();
                
                var allPeriods = [];
                
                try {
                    Utils.log('Tentative de parsing JSON', 'updatePeriods');
                    var jsonPeriods = JSON.parse(text);
                    
                    if (!Array.isArray(jsonPeriods)) {
                        jsonPeriods = [jsonPeriods];
                    }
                    
                    Utils.log(jsonPeriods, 'JSON parsé avec succès');
                    
                    allPeriods = jsonPeriods.map(function(period) {
                        return [
                            period.dt_type || 'between_date',
                            period.begin_date || '',
                            period.end_date || '',
                            period.begin_time || '00:00:00',
                            period.end_time || '24:00:00'
                        ];
                    });
                    
                    Utils.log(allPeriods, 'Périodes converties du JSON');
                    
                } catch (jsonError) {
                    Utils.log('JSON parsing failed, trying old format', 'updatePeriods', 1);
                    Utils.log(jsonError, 'JSON error');
                    
                    var periodStrings = text.split('£');
                    allPeriods = periodStrings.map(function(periodStr) {
                        return periodStr.split('#');
                    });
                    
                    Utils.log(allPeriods, 'Périodes du format ancien');
                }
                
                //  Stocker les périodes pour update_custom
                // if (dashboardType === 'update_custom') {
                //     TokenManager.set('downtime_selected', text);
                // }
                
                for (var i = 0; i < allPeriods.length; i++) {
                    var periodValue = allPeriods[i];
                    var periodNumber = (i + 1).toString();
                    
                    Utils.log(periodValue, 'Création période ' + periodNumber);
                    
                    UIManager.appendPeriodTab(
                        'tabs',
                        'Periode ' + periodNumber,
                        periodValue[CONFIG.PERIOD_FIELDS.TYPE] || periodValue[0],
                        periodValue[CONFIG.PERIOD_FIELDS.BEGIN_DAY] || periodValue[1],
                        periodValue[CONFIG.PERIOD_FIELDS.BEGIN_HOUR] || periodValue[3],
                        periodValue[CONFIG.PERIOD_FIELDS.END_DAY] || periodValue[2],
                        periodValue[CONFIG.PERIOD_FIELDS.END_HOUR] || periodValue[4]
                    );
                    
                    var periodType = periodValue[CONFIG.PERIOD_FIELDS.TYPE] || periodValue[0];
                    if (periodType == 'between_date') {
                        var beginDay = periodValue[CONFIG.PERIOD_FIELDS.BEGIN_DAY] || periodValue[1];
                        DatePickerManager.apply(beginDay);
                    }
                }
                
                $('[id^=selectable]').selectable();
                
                try {
                    $('#commentaire').val(commentary);
                } catch (error) {
                    Utils.log(error, 'unable to write in #commentaire', 1);
                }
                
                //  Mettre à jour la description pour update_custom
                // if (dashboardType === 'update_custom') {
                //     UIManager.updateDescriptionDiv();
                // }
                
                Utils.log('updatePeriods - END', 'updatePeriods');
            },

            getSelectedInDashboard() {
                Utils.log('', 'getSelectedInDashboard - START');
                
                var selected = {};
                var errors = 0;
                var errorOutput = 'Impossible de valider le downtime :<br />';
                var dashboardType = $('#dashboardType').html();
                
                Utils.log(dashboardType, 'Dashboard type');
                
                var sendingEmail = TokenManager.get("sendingEmail");
                var email = TokenManager.get("email");
                var sendEmail = '';
                
                if (Utils.isNotNull(sendingEmail) && Utils.checkEmail(email)) {
                    var action = dashboardType == 'add' ? 'Ajout' : (dashboardType == 'update' ? 'Modification' : 'Suppression');
                    sendEmail = `| table ID,result | transpose column_name="Champs"
                        | sendemail to="${email}" subject="${action} de downtime" sendresults=true inline=true format=table
                        message="Le downtime ${selected['ID']} vient d'être ${action == 'Ajout' ? 'soumis' : 'mis à jour'}, voici le récapitulatif"`;
                }

                if (dashboardType == "delete") {
                    Utils.log('Mode DELETE détecté', 'getSelectedInDashboard');
                    return DataManager.getDeleteData(selected, sendEmail);
                }
                
                if (dashboardType == "update_custom") {
                    Utils.log('Mode UPDATE_CUSTOM détecté', 'getSelectedInDashboard');
                    return DataManager.getUpdateCustomData(selected, sendEmail);
                }

                selected['sendEmail'] = sendEmail;
                selected['key'] = TokenManager.get('key') || '';
                selected['ID'] = TokenManager.get('DT_ID') || Utils.createID();
                selected['username'] = Splunk.util.getConfigValue('USERNAME');
                selected['lookup_name'] = 'omni_kv';
                selected['commentary'] = TextTransformer.removeAccents($('#commentaire').val());
                selected['service'] = TextTransformer.forKV(TokenManager.get('service_selected'));
                selected['kpi'] = TextTransformer.forKV(TokenManager.get('kpi_selected'));
                selected['entity'] = TextTransformer.forKV(TokenManager.get('entity_selected'));
                selected['step_opt'] = DataManager.getStepOpt();
                selected['dt_filter'] = TokenManager.get('dt_filter_selected') || '';
                selected['dt_pattern'] = TokenManager.get('dt_pattern_selected') || '';
                selected['downtimeFields'] = [];
                
                Utils.log(selected, 'Données de base collectées');
                
                if (dashboardType == "add") {
                    selected['version'] = TokenManager.get('selected_version') || 1;
                } else if (dashboardType == "update") {
                    selected['version'] = parseInt(TokenManager.get('selected_version') || 50) + 2;
                }

                Utils.log('Collecte des périodes', 'getSelectedInDashboard');
                var periodData = DataManager.collectPeriods();
                selected['downtimeFields'] = periodData.downtimeFields;
                errors += periodData.errors;
                errorOutput += periodData.errorOutput;
                
                Utils.log(periodData, 'Données des périodes');

                if (Utils.isNull(selected['service'])) {
                    errors++;
                    errorOutput += '- Veuillez sélectionner un ou plusieurs services<br />';
                }
                if (Utils.isNull(selected['kpi'])) {
                    errors++;
                    errorOutput += '- Veuillez sélectionner une ou plusieurs kpi<br />';
                }
                if (Utils.isNull(selected['entity'])) {
                    errors++;
                    errorOutput += '- Veuillez sélectionner une ou plusieurs entités<br />';
                }
                if (Utils.isNull(selected['commentary'])) {
                    errors++;
                    errorOutput += '- Veuillez entrer un commentaire détaillé<br />';
                }

                Utils.log({errors: errors, errorOutput: errorOutput}, 'Résultat validation finale');
                
                return [selected, errors, errorOutput];
            },

            getDeleteData(selected, sendEmail) {
                selected['key'] = TokenManager.get('key') || '';
                selected['ID'] = TokenManager.get('DT_ID') || Utils.createID();
                selected['commentary'] = TextTransformer.removeAccents($('#commentaire').val());
                selected['sendEmail'] = sendEmail;
                selected['username'] = Splunk.util.getConfigValue('USERNAME');
                selected['lookup_name'] = 'omni_kv';
                selected['service'] = TextTransformer.forKV(TokenManager.get('service_selected'));
                selected['kpi'] = TextTransformer.forKV(TokenManager.get('kpi_selected'));
                selected['entity'] = TextTransformer.forKV(TokenManager.get('entity_selected'));
                selected['step_opt'] = DataManager.getStepOpt();
                selected['dt_filter'] = TokenManager.get('dt_filter_selected') || '';
                selected['dt_pattern'] = TokenManager.get('dt_pattern_selected') || '';
                selected['downtimeFields'] = TokenManager.get('downtime_selected').split("£");
                selected['version'] = TokenManager.get('selected_version') || 99999;
                
                var errors = 0;
                var errorOutput = '';
                
                if (Utils.isNull(selected['commentary'])) {
                    errors++;
                    errorOutput = 'Impossible de valider le downtime :<br /><br />- Veuillez entrer un commentaire détaillé<br />';
                }
                
                Utils.log(selected, 'Delete data collectée');
                
                return [selected, errors, errorOutput];
            },

            getUpdateCustomData(selected, sendEmail) {
                Utils.log('getUpdateCustomData - START', 'getUpdateCustomData');
                
                selected['key'] = TokenManager.get('key') || '';
                selected['ID'] = TokenManager.get('DT_ID') || Utils.createID();
                selected['commentary'] = TextTransformer.removeAccents($('#commentaire').val());
                selected['sendEmail'] = sendEmail;
                selected['username'] = Splunk.util.getConfigValue('USERNAME');
                selected['lookup_name'] = 'omni_kv';
                selected['service'] = TextTransformer.forKV(TokenManager.get('service_selected'));
                selected['kpi'] = TextTransformer.forKV(TokenManager.get('kpi_selected'));
                selected['entity'] = TextTransformer.forKV(TokenManager.get('entity_selected'));
                selected['step_opt'] = DataManager.getStepOpt();
                selected['dt_pattern'] = TokenManager.get('dt_pattern_selected') || '';
                selected['downtimeFields'] = TokenManager.get('downtime_selected').split("£");
                selected['version'] = parseInt(TokenManager.get('selected_version') || 50) + 2;
                
                //  Récupérer le dt_filter depuis les tokens
                selected['dt_filter'] = TokenManager.get('dt_filter_selected') || '';
                
                Utils.log(selected, 'Update custom data collectée');
                
                // Validation
                var errors = 0;
                var errorOutput = '';
                
                if (Utils.isNull(selected['commentary'])) {
                    errors++;
                    errorOutput += '- Veuillez entrer un commentaire détaillé<br />';
                }
                
                if (Utils.isNull(selected['dt_filter'])) {
                    errors++;
                    errorOutput += '- Le filtre personnalisé est requis<br />';
                }
                
                if (errors > 0) {
                    errorOutput = 'Impossible de valider le downtime :<br /><br />' + errorOutput;
                }
                
                Utils.log({errors: errors, errorOutput: errorOutput}, 'Validation result');
                
                return [selected, errors, errorOutput];
            },


             collectPeriods() {
                Utils.log('Début collectPeriods', 'collectPeriods');
                
                var checkedBegin = [], checkedEnd = [], beginHours = [], endHours = [], type = [];
                var downtimeFields = [];
                var errors = 0;
                var errorOutput = '';
                var atLeastOne = 0;
                var periodCount = 0;

                $('[id^=content-tab-Period]').each(function () {
                    periodCount++;
                    Utils.log('Traitement période ' + periodCount, 'collectPeriods');
                    
                    var dateBegin = '', dateEnd = '', hoursBegin = '', hoursEnd = '';
                    var periodValid = false;

                    if ($(this).find('[periodID=radioD]').is(':checked')) {
                        Utils.log('Type: Date à date', 'collectPeriods');
                        dateBegin = $(this).find('[id^=datepicker_begin]').val();
                        dateEnd = $(this).find('[id^=datepicker_end]').val();
                        Utils.log({dateBegin: dateBegin, dateEnd: dateEnd}, 'Dates collectées');
                        
                        if (dateBegin.length == 10 && dateEnd.length == 10) {
                            atLeastOne = 1;
                            periodValid = true;
                            checkedBegin.push(dateBegin);
                            checkedEnd.push(dateEnd);
                            type.push('between_date');
                        }
                    } else if ($(this).find('[periodID=radioW]').is(':checked')) {
                        Utils.log('Type: Hebdomadaire', 'collectPeriods');
                        dateBegin = [];
                        dateEnd = [];
                        atLeastOne = 1;
                        periodValid = true;
                        $(this).find('.ui-selected').each(function () {
                            dateBegin.push($(this).html());
                            dateEnd.push($(this).html());
                        });
                        checkedBegin.push(dateBegin.join(';'));
                        checkedEnd.push(dateEnd.join(';'));
                        type.push('weekly');
                    } else if ($(this).find('[periodID=radioM]').is(':checked')) {
                        Utils.log('Type: Mensuel', 'collectPeriods');
                        dateBegin = [];
                        dateEnd = [];
                        atLeastOne = 1;
                        periodValid = true;
                        $(this).find('.ui-selected').each(function () {
                            dateBegin.push($(this).html());
                            dateEnd.push($(this).html());
                        });
                        checkedBegin.push(dateBegin.join(';'));
                        checkedEnd.push(dateEnd.join(';'));
                        type.push('monthly');
                    } else if ($(this).find('[periodID=radioS]').is(':checked')) {
                        Utils.log('Type: Spécifique', 'collectPeriods');
                        atLeastOne = 1;
                        periodValid = true;
                        dateBegin = $(this).find('#select_day').val();
                        dateEnd = $(this).find('#select_day').val();
                        checkedBegin.push(dateBegin);
                        checkedEnd.push(dateEnd);
                        var selectedType = $(this).find('#select_type').val();
                        type.push('special_date_' + selectedType + '_in_month');
                    }

                    if (periodValid) {
                        hoursBegin = $(this).find('.inputPeriodBegin').val();
                        hoursEnd = $(this).find('.inputPeriodEnd').val();
                        
                        Utils.log({hoursBegin: hoursBegin, hoursEnd: hoursEnd}, 'Heures collectées');
                        
                        if (!Validator.timeFormat(hoursBegin)) {
                            errors++;
                            errorOutput += '- Format heure de début invalide (HH:MM)<br />';
                        }
                        if (!Validator.timeFormat(hoursEnd)) {
                            errors++;
                            errorOutput += '- Format heure de fin invalide (HH:MM)<br />';
                        }
                        if (hoursBegin == hoursEnd && dateBegin == dateEnd) {
                            errors++;
                            errorOutput += '- Les heures de début et fin ne peuvent être identiques<br />';
                        }
                        if (Validator.endAfterBegin(dateBegin, dateEnd, hoursBegin, hoursEnd)) {
                            errors++;
                            errorOutput += '- L\'heure de début ne peut être supérieure à l\'heure de fin<br />';
                        }
                    } else {
                        hoursBegin = '00:00';
                        hoursEnd = '00:00';
                    }

                    beginHours.push(hoursBegin);
                    endHours.push(hoursEnd);
                    
                    var downtimeField = DataManager.transformDowntimeField(
                        type[type.length - 1] || 'between_date',
                        TextTransformer.forKV(TextTransformer.daysToEnglish(checkedBegin[checkedBegin.length - 1] || '')),
                        TextTransformer.forKV(TextTransformer.daysToEnglish(checkedEnd[checkedEnd.length - 1] || '')),
                        (beginHours[beginHours.length - 1] || '00:00') + ':00',
                        (endHours[endHours.length - 1] || '00:00') + ':00'
                    );

                
downtimeFields.push(downtimeField);
                Utils.log(downtimeField, 'Downtime field créé');
            });

            if (errors > 0) {
                errorOutput += '- Au moins une période ne respecte pas les pré-requis<br />';
            }
            
            Utils.log({downtimeFields: downtimeFields, errors: errors}, 'Résultat collectPeriods');

            return { downtimeFields, errors, errorOutput };
        },

        transformDowntimeField(downtimeType, begin_day, end_day, begin_hour, end_hour) {
            return `${downtimeType}#${begin_day}#${end_day}#${begin_hour}#${end_hour}`;
        },

        getStepOpt() {
            var tokenValue = TokenManager.get("step_opt_for_delete");
            if (Utils.isNotNull(tokenValue)) return tokenValue;
            
            //  FIX : Vérifier les deux noms de tokens possibles
            var serviceToken = TokenManager.get('service_select_input_type');
            var kpiToken = TokenManager.get('kpi_select_input_type');
            var entityToken = TokenManager.get('entity_select_input_type');
            
            Utils.log({
                serviceToken: serviceToken,
                kpiToken: kpiToken,
                entityToken: entityToken
            }, 'getStepOpt - tokens récupérés');
            
            if (Utils.isNotNull(serviceToken) && Utils.isNotNull(kpiToken) && Utils.isNotNull(entityToken)) {
                var stepOpt = serviceToken.toString() + kpiToken.toString() + entityToken.toString();
                Utils.log(stepOpt, 'step_opt calculé');
                return stepOpt;
            }
            
            Utils.log('step_opt par défaut: 000', 'getStepOpt', 1);
            return "000";
        }
    };

    // ==================== DASHBOARD ====================
    const Dashboard = {
        createAdd() {
            UIManager.create();
            UIManager.appendPeriodTab('tabs', 'Periode 1');
            DatePickerManager.apply();
            $('[id^=selectable]').selectable();
        },

        createUpdate(downtimeID) {
            Utils.log(downtimeID, 'createUpdate');
            Dashboard.loadDowntimeData(downtimeID, 'update');
        },

        createDelete(downtimeID) {
            Utils.log(downtimeID, 'createDelete');
            Dashboard.loadDowntimeData(downtimeID, 'delete');
        },

        createUpdateCustom(downtimeID) {
            Utils.log(downtimeID, 'createUpdateCustom');
            Dashboard.loadDowntimeData(downtimeID, 'update_custom');
        },

        loadDowntimeData(downtimeID, type) {
            var query = QueryBuilder.withDowntimeID(downtimeID);
            var epoch = (new Date).getTime();
            
            var existingDowntimeSearch = new SearchManager({
                id: 'existingDowntimeSearch' + epoch,
                preview: false,
                cache: false,
                search: mvc.tokenSafe(query),
            });

            existingDowntimeSearch.on('search:done', function (properties) {
                Utils.log(properties, 'existingDowntimeSearch done');
                
                if (properties.content.resultCount > 0) {
                    var myResults = this.data('results', { count: 0 });
                    myResults.on('data', function () {
                        var downtimeData = myResults.data().rows;
                        DataManager.fillDashboard(downtimeData, type);
                    });
                }
            });

            existingDowntimeSearch.on('search:failed', function(properties) {
                Utils.log(properties, 'existingDowntimeSearch failed', 2);
            });
        },

        sendData(sendingType) {
            Utils.log(sendingType, '============ sendData - START ============');
            
            try {
                LoadSpinner.changeMsg('Verification des données en entrée');
                LoadSpinner.state('ON');
                
                var dashboardType = $('#dashboardType').html();
                
                if (dashboardType !== 'delete' && dashboardType !== 'update_custom') {
                    Utils.log('Validation des datepickers', 'sendData');
                    var dateValidationErrors = Validator.allDatepickers();
                    Utils.log(dateValidationErrors, 'Erreurs de validation dates');
                    
                    if (dateValidationErrors.length > 0) {
                        Utils.log('Erreurs de validation détectées', 'sendData', 1);
                        LoadSpinner.state('OFF');
                        TokenManager.set('modal_header', 'ERREUR');
                        TokenManager.set('modal_content', dateValidationErrors);
                        $('#modal_link')[0].click();
                        return;
                    }
                }
                
                Utils.log('Collecte des données du dashboard', 'sendData');
                var [selected, errors, errorOutput] = DataManager.getSelectedInDashboard();
                
                Utils.log(selected, 'Selected data');
                Utils.log(errors, 'Nombre d\'erreurs');
                Utils.log(errorOutput, 'Messages d\'erreur');
                
                if (errors > 0) {
                    Utils.log('Erreurs de validation des données', 'sendData', 1);
                    LoadSpinner.state('OFF');
                    TokenManager.set('modal_header', 'ERREUR');
                    TokenManager.set('modal_content', errorOutput);
                    $('#modal_link')[0].click();
                    return;
                }
                
                $('input#VALID_button').hide();
                $('input#CANCEL_button').hide();
                LoadSpinner.changeMsg('Mise à jour 0%');
                
                var query = '';
                try {
                    Utils.log('Création de la query', 'sendData');
                    if (dashboardType == 'add') {
                        Utils.log('Création query ADD', 'Dashboard type');
                        query = QueryBuilder.createAdd(selected);
                    } else if (dashboardType == 'update' || dashboardType == 'update_custom') {
                        Utils.log('Création query UPDATE', 'Dashboard type');
                        query = QueryBuilder.createUpdate(selected);
                    } else if (dashboardType == 'delete') {
                        Utils.log('Création query DELETE', 'Dashboard type');
                        query = QueryBuilder.createDelete(selected);
                    }
                    
                    Utils.log(query, '========== QUERY FINALE GÉNÉRÉE ==========', 0);
                    
                } catch (queryError) {
                    Utils.log(queryError, 'ERREUR lors de la création de la query', 2);
                    console.error('Stack trace:', queryError.stack);
                    LoadSpinner.state('OFF');
                    $('input#VALID_button').show();
                    $('input#CANCEL_button').show();
                    TokenManager.set('modal_header', 'ERREUR');
                    TokenManager.set('modal_content', 'Erreur lors de la génération de la requête: ' + queryError.message);
                    $('#modal_link')[0].click();
                    return;
                }
                
                if (sendingType == 'valid') {
                    Utils.log('Lancement de la recherche Splunk', 'SendingType valid');
                    
                    var omni_kv = new SearchManager({
                        id: 'omni_kv' + selected['ID'],
                        preview: false,
                        cache: false,
                        search: mvc.tokenSafe(query),
                    });
                    
                    omni_kv.on('search:done', function (properties) {
                        Utils.log(properties, 'omni_kv search done');
                        
                        var closingLink = dashboardType == 'add' 
                            ? '<a href="/app/' + app_path + '/' + viewName + '">Fermer la fenêtre</a>'
                            : '<a href="/app/' + app_path + '/accueil">Fermer la fenêtre</a>';
                        
                        var successMessage = dashboardType == 'delete'
                            ? 'Suppression de la maintenance effectuée avec succès'
                            : (dashboardType == 'update_custom' 
                                ? 'Modification du filtre personnalisé effectuée avec succès'
                                : 'Mise à jour de la base des downtimes OK');
                        
                        Dashboard.showSuccessMessage('Information', successMessage, closingLink);
                    });
                    
                    omni_kv.on('search:failed', function(properties) {
                        Utils.log(properties, 'omni_kv search FAILED', 2);
                        LoadSpinner.state('OFF');
                        $('input#VALID_button').show();
                        $('input#CANCEL_button').show();
                        TokenManager.set('modal_header', 'ERREUR');
                        TokenManager.set('modal_content', 'La recherche Splunk a échoué. Vérifiez les logs.');
                        $('#modal_link')[0].click();
                    });
                    
                    omni_kv.on('search:error', function(properties) {
                        Utils.log(properties, 'omni_kv search ERROR', 2);
                        LoadSpinner.state('OFF');
                        $('input#VALID_button').show();
                        $('input#CANCEL_button').show();
                    });
                } else {
                    Utils.log('Mode test - query générée mais non exécutée', 'sendData');
                    LoadSpinner.state('OFF');
                    $('input#VALID_button').show();
                    $('input#CANCEL_button').show();
                }
                
            } catch (error) {
                Utils.log(error, 'ERREUR CRITIQUE dans sendData', 2);
                console.error('Erreur complète:', error);
                console.error('Stack trace:', error.stack);
                LoadSpinner.state('OFF');
                $('input#VALID_button').show();
                $('input#CANCEL_button').show();
                TokenManager.set('modal_header', 'ERREUR CRITIQUE');
                TokenManager.set('modal_content', 'Une erreur inattendue s\'est produite: ' + error.message);
                $('#modal_link')[0].click();
            }
        },

        showSuccessMessage(header, content, footer) {
            Utils.log([header, content, footer], 'showSuccessMessage');
            
            LoadSpinner.changeMsg('Mise à jour 50%');
            Utils.applySleep(1000);
            LoadSpinner.changeMsg('Mise à jour 100%');
            
            $('#modal_popup').modal({
                escapeClose: false,
                clickClose: false,
                showClose: false,
            });
            
            TokenManager.set('modal_header', header);
            TokenManager.set('modal_content', content);
            TokenManager.set('modal_footer', footer);
            $('#modal_link')[0].click();
            LoadSpinner.state('OFF');
        }
    };

    // ==================== GESTION DES TOOLTIPS ====================
    var originalTooltip = $.fn.tooltip;
    $.fn.tooltip = function(options) {
        try {
            if (options === 'destroy' && !this.data('ui-tooltip')) {
                return this;
            }
            return originalTooltip.apply(this, arguments);
        } catch (e) {
            Utils.log(e, 'Tooltip error', 1);
            return this;
        }
    };

    // ==================== INITIALISATION ====================
    $(document).ready(function () {
        Utils.log('Document ready', 'Initialisation');
        
        UIManager.create();
        var downtimeID = TokenManager.get('DT_ID');
        var dashboardType = $('#dashboardType').html();
        
        Utils.log({downtimeID: downtimeID, dashboardType: dashboardType}, 'Paramètres initialisation');
        
        if (dashboardType == 'add') {
            Utils.log('Mode ADD', 'Initialisation');
            Dashboard.createAdd();
        } else if (dashboardType == 'update') {
            Utils.log('Mode UPDATE', 'Initialisation');
            if (Utils.isNotNull(downtimeID)) {
                Dashboard.createUpdate(downtimeID);
            }
        } else if (dashboardType == 'delete') {
            Utils.log('Mode DELETE', 'Initialisation');
            if (Utils.isNotNull(downtimeID)) {
                Dashboard.createDelete(downtimeID);
            }
        } else if (dashboardType == 'update_custom') {
            Utils.log('Mode UPDATE_CUSTOM', 'Initialisation');
            if (Utils.isNotNull(downtimeID)) {
                Dashboard.createUpdateCustom(downtimeID);
            }
        }
    });

    // ==================== ÉVÉNEMENTS ====================
    $(document).on('click', '#tAdd', function () {
        Utils.log('Click sur tAdd', 'Événements');
        UIManager.appendPeriodTab('tabs', 'Periode ' + numberTabs);
        $('[id^=selectable]').selectable();
        DatePickerManager.apply();
    });

    $(document).on('click', '.btnx', function () {
        Utils.log('Click sur btnx', 'Événements');
        var cur = $(this).attr('id').replace('btnx', 'tab');
        var $tab = $('#' + cur);
        var $content = $('#content-' + cur);
        
        $tab.find('[data-ui-tooltip]').each(function() {
            if ($(this).data('ui-tooltip')) {
                $(this).tooltip('destroy');
            }
        });
        $content.find('[data-ui-tooltip]').each(function() {
            if ($(this).data('ui-tooltip')) {
                $(this).tooltip('destroy');
            }
        });
        
        $tab.remove();
        $content.remove();
        numberTabs -= 1;
    });

    $(document).on('click', '.tab', function () {
        Utils.log('Click sur tab', 'Événements');
        $('.tab-content').removeClass('current');
        var cur = 'content-' + $(this).attr('id');
        $('#' + cur).addClass('current');
    });

    $(document).on('click', 'input#VALID_button', function () {
        Utils.log('========== CLICK SUR VALIDER ==========', 'Événements', 0);
        Dashboard.sendData('valid');
    });

    $(document).on('click', 'input#TEST_button', function () {
        Utils.log('========== CLICK SUR TEST ==========', 'Événements', 0);
        Dashboard.sendData('test');
    });

    $(document).on('click', 'input#CANCEL_button', function () {
        Utils.log('Click sur Cancel', 'Événements');
        window.location.href = '/app/' + app_path + '/' + viewName;
    });

    $('body').on('change', '.radiobasis', function () {
        Utils.log('Change radiobasis', 'Événements');
        var cur = $(this).attr('id').replace('form-', '');
        var selected_value = $('input[name="basis-' + cur + '"]:checked').val();
        Utils.log({cur: cur, selected_value: selected_value}, 'Radiobasis change');
        $('#table-' + cur).html(UIManager.createPeriodContent(cur, selected_value));
        $('[id^=selectable]').selectable();
        DatePickerManager.apply();
    });

}); // Fin du require principal
}); // Fin du require initial