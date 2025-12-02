var scriptName = 'Omni_Journal';
var scriptVersion = '2.0.0'; // Version avec support JSON downtime
console.log('%c %s', 'background: #222; color: #bada55', scriptName + ' Version: ' + scriptVersion);

var app_path = 'otchee_app_omni';
var viewName = '';

require([
    'underscore',
    'jquery',
    'splunkjs/mvc',
    'splunkjs/mvc/tableview',
    'splunkjs/mvc/chartview',
    'splunkjs/mvc/searchmanager',
    'css!../app/' + app_path + '/omni/lib/jquery-ui.min.css',
    'css!../app/' + app_path + '/omni/omni_journal.css',
    'splunkjs/mvc/simplexml/ready!'
], function (_, $, mvc, TableView) {
    var debugMode = 1;
    const LOGTITLE = 'Journal';

    // ==================== UTILITAIRES ====================
    function log(obj, titre = '', level = 0) {
        var tag = '';
        if (isNotNull(LOGTITLE)) {
            tag += LOGTITLE + ' ';
        }
        var debug = debugMode || 1;
        var color;
        
        if (debug == 1) {
            if (level == 0) {
                color = '#FFFFFF';
                tag += 'Info';
            } else if (level == 1) {
                color = '#FFFF00';
                tag += 'Warn';
            } else if (level == 2) {
                color = '#FF0000';
                tag += 'Crit';
            } else {
                color = '#DDDDDD';
                tag = '';
            }
            
            console.groupCollapsed(
                '%c %s',
                'background: #000000; color: ' + color,
                tag + '--' + titre + '--'
            );
            
            if (Array.isArray(obj)) {
                try {
                    console.table(obj);
                } catch (err) {
                    console.error(err);
                }
            } else {
                try {
                    if (level == 0) {
                        console.info(obj);
                    } else if (level == 1) {
                        console.warn(obj);
                    } else if (level == 2) {
                        console.error(obj);
                    } else {
                        console.log(obj);
                    }
                } catch (err) {
                    console.error(err);
                }
            }
            console.groupEnd();
        }
    }

    function isNotNull(variable) {
        return !isNull(variable);
    }

    function isNull(variable) {
        if (typeof variable === 'undefined' || variable === null) {
            try {
                return (variable == '' || variable == undefined || variable.length == 0);
            } catch (e) {
                return true;
            }
        } else {
            return false;
        }
    }

    function itemize(itemString) {
        /* Fonction de formatage des data en forme de TAG */
        try {
            if (isNull(itemString)) {
                return '';
            }
            
            if (itemString == '%' || itemString == '*') {
                itemString = 'Tous';
            }
            
            itemString = itemString.replace("%", "*");
            itemString = itemString.split(';');
            var outputString = '';

            for (let i = 0; i < itemString.length; i++) {
                outputString += '<span class="description_item">' + itemString[i] + '</span>';
            }
            return outputString;
        } catch (error) {
            log(error, 'Error in itemize', 2);
            return '';
        }
    }

    // ==================== PARSER JSON DOWNTIME ====================
    function parseDowntimeJSON(downtimeString) {
        /* Parse le JSON downtime et retourne un tableau d'objets de périodes */
        try {
            if (isNull(downtimeString) || downtimeString === '') {
                return [];
            }

            log(downtimeString, 'Downtime string to parse');

            // Parser le JSON
            var periods = JSON.parse(downtimeString);
            
            if (!Array.isArray(periods)) {
                log('Downtime is not an array', 'parseDowntimeJSON', 1);
                return [];
            }

            log(periods, 'Parsed periods');
            return periods;

        } catch (error) {
            log(error, 'Error parsing downtime JSON', 2);
            return [];
        }
    }

    function formatPeriod(period) {
        /* Formate une période pour l'affichage */
        try {
            if (isNull(period)) {
                return '';
            }

            var output = '<div class="period-item">';
            
            // Type de période
            var typeLabel = '';
            switch (period.dt_type) {
                case 'between_date':
                    typeLabel = '<span class="period-type-badge badge-date">Date à date</span>';
                    break;
                case 'weekly':
                    typeLabel = '<span class="period-type-badge badge-weekly">Hebdomadaire</span>';
                    break;
                case 'monthly':
                    typeLabel = '<span class="period-type-badge badge-monthly">Mensuel</span>';
                    break;
                default:
                    if (period.dt_type && period.dt_type.startsWith('special_date')) {
                        typeLabel = '<span class="period-type-badge badge-special">Spécifique</span>';
                    } else {
                        typeLabel = '<span class="period-type-badge badge-other">' + period.dt_type + '</span>';
                    }
            }
            
            output += typeLabel + ' ';

            // Dates et heures
            if (period.dt_type === 'between_date') {
                output += '<strong>Du</strong> ' + period.begin_date + ' <em>' + period.begin_time + '</em> ';
                output += '<strong>au</strong> ' + period.end_date + ' <em>' + period.end_time + '</em>';
            } else if (period.dt_type === 'weekly') {
                var days = period.begin_date.split(';').join(', ');
                output += '<strong>Les</strong> ' + days + ' ';
                output += '<strong>de</strong> <em>' + period.begin_time + '</em> ';
                output += '<strong>à</strong> <em>' + period.end_time + '</em>';
            } else if (period.dt_type === 'monthly') {
                var days = period.begin_date.split(';').join(', ');
                output += '<strong>Les jours</strong> ' + days + ' ';
                output += '<strong>de</strong> <em>' + period.begin_time + '</em> ';
                output += '<strong>à</strong> <em>' + period.end_time + '</em>';
            } else if (period.dt_type && period.dt_type.startsWith('special_date')) {
                var typeText = period.dt_type.replace('special_date_', '').replace('_in_month', '');
                var typeMapping = {
                    'first': 'Premier',
                    'second': 'Deuxième',
                    'third': 'Troisième',
                    'fourth': 'Quatrième',
                    'last': 'Dernier'
                };
                output += '<strong>' + (typeMapping[typeText] || typeText) + '</strong> ';
                output += period.begin_date + ' <strong>du mois</strong> ';
                output += '<strong>de</strong> <em>' + period.begin_time + '</em> ';
                output += '<strong>à</strong> <em>' + period.end_time + '</em>';
            }

            // Filtres personnalisés
            if (isNotNull(period.dt_filter) && period.dt_filter !== '') {
                output += '<br/><span class="period-filter"><strong>Filtre:</strong> ' + period.dt_filter + '</span>';
            }

            // Pattern
            if (isNotNull(period.dt_pattern) && period.dt_pattern !== '') {
                output += '<br/><span class="period-pattern"><strong>Pattern:</strong> ' + period.dt_pattern + '</span>';
            }

            output += '</div>';
            return output;

        } catch (error) {
            log(error, 'Error formatting period', 2);
            return '<div class="period-error">Erreur de formatage</div>';
        }
    }

    function formatAllPeriods(downtimeString) {
        /* Formate toutes les périodes d'un downtime */
        try {
            var periods = parseDowntimeJSON(downtimeString);
            
            if (periods.length === 0) {
                return '<div class="no-periods">Aucune période définie</div>';
            }

            var output = '<div class="periods-container">';
            
            for (var i = 0; i < periods.length; i++) {
                output += '<div class="period-wrapper">';
                output += '<div class="period-number">Période ' + (i + 1) + '</div>';
                output += formatPeriod(periods[i]);
                output += '</div>';
            }
            
            output += '</div>';
            return output;

        } catch (error) {
            log(error, 'Error formatting all periods', 2);
            return '<div class="periods-error">Erreur lors du formatage des périodes</div>';
        }
    }

    // ==================== CUSTOM CELL RENDERER ====================
    var CustomRangeRenderer = TableView.BaseCellRenderer.extend({
        canRender: function (cell) {
            return _(['O', 'ID', 'DATE', 'ACTION', 'SERVICE', 'KPI', 'ENTITY', 'COMMENTAIRE', 
                     'VERSION', 'FOREIGN_UPDATE', 'DOWNTIME', 'PERIODS', 'NB_PERIODS', 
                     'DT_FILTER', 'DT_PATTERN']).contains(cell.field);
        },

        render: function ($td, cell) {
            var value = cell.value;

            if (cell.field === 'O') {
                if (parseInt(value) == 1) {
                    $td.addClass('range-cell').addClass('range-owner');
                }
                if (parseInt(value) == 0) {
                    $td.addClass('range-cell').addClass('range-other');
                }
                $td.text(value).addClass('string');
            }
            
            if (cell.field === 'FOREIGN_UPDATE') {
                if (parseInt(value) == 1) {
                    $td.addClass('range-cell').addClass('range-update');
                }
                if (parseInt(value) == 0) {
                    $td.addClass('range-cell').addClass('range-nochange');
                }
                $td.text(value).addClass('string');
            }
            
            if (cell.field === 'ACTION') {
                if (value == 'add') {
                    $td.addClass('range-cell').addClass('range-add');
                }
                if (value == 'update') {
                    $td.addClass('range-cell').addClass('range-modify');
                }
                if (value == 'delete') {
                    $td.addClass('range-cell').addClass('range-delete');
                }
                if (value == 'obsolete') {
                    $td.addClass('range-cell').addClass('range-obsolete');
                }
                $td.text(value).addClass('string');
            }
            
            // Masquer certaines colonnes
            if (cell.field === 'COMMENTAIRE' || cell.field === 'SERVICE' || 
                cell.field === 'KPI' || cell.field === 'ENTITY' || 
                cell.field === 'DOWNTIME' || cell.field === 'PERIODS' ||  cell.field === 'NB_PERIODS' ||
                cell.field === 'DT_FILTER' || cell.field === 'DT_PATTERN') {
                $td.addClass('range-cell').addClass('hide');
            }
            
            if (cell.field === 'VERSION') {
                $td.addClass('range-cell').addClass('maintenance_version');
                $td.text(value).addClass('string');
            }
            
            if (cell.field === 'ID') {
                $td.addClass('range-cell').addClass('maintenance_id');
                $td.text(value).addClass('string');
            }
            
            if (cell.field === 'DATE') {
                $td.addClass('range-cell').addClass('maintenance_date');
                $td.text(value).addClass('string');
            }
            
            if (cell.field === 'NB_PERIODS') {
                $td.addClass('range-cell').addClass('maintenance_periods_count');
                var countText = value === '1' ? '1 période' : value + ' périodes';
                $td.text(countText).addClass('string');
            }
        }
    });

    // ==================== ROW EXPANSION ====================
    var EventSearchBasedRowExpansionRenderer = TableView.BaseRowExpansionRenderer.extend({
        canRender: function (rowData) {
            return true;
        },
        
        render: function ($container, rowData) {
            // Récupération des cellules
            var service = _(rowData.cells).find(function (cell) {
                return cell.field === 'SERVICE';
            });
            
            var kpi = _(rowData.cells).find(function (cell) {
                return cell.field === 'KPI';
            });
            
            var entity = _(rowData.cells).find(function (cell) {
                return cell.field === 'ENTITY';
            });
            
            var commentary = _(rowData.cells).find(function (cell) {
                return cell.field === 'COMMENTAIRE';
            });
            
            var downtime = _(rowData.cells).find(function (cell) {
                return cell.field === 'DOWNTIME';
            });
            
            var dtFilter = _(rowData.cells).find(function (cell) {
                return cell.field === 'DT_FILTER';
            });
            
            var dtPattern = _(rowData.cells).find(function (cell) {
                return cell.field === 'DT_PATTERN';
            });

            // Construction du HTML
            var html = "<div><span><table width='100%'>";
            html += "<tr><td class='dataexpansion'><h2 class='title-search'>Informations de la Maintenance</h2></td><td></td></tr>";
            
            // Informations de base
            html += "<tr><td><b class='search-bold'>Service</b>: </td><td>" + itemize(service.value) + "</td></tr>";
            html += "<tr><td><b class='search-bold'>KPI</b>: </td><td>" + itemize(kpi.value) + "</td></tr>";
            html += "<tr><td><b class='search-bold'>Entity</b>: </td><td>" + itemize(entity.value) + "</td></tr>";
            
            // Filtres et patterns
            if (isNotNull(dtFilter) && dtFilter.value !== '') {
                html += "<tr><td><b class='search-bold'>Filtre personnalisé</b>: </td><td>" + dtFilter.value + "</td></tr>";
            }
            
            if (isNotNull(dtPattern) && dtPattern.value !== '') {
                html += "<tr><td><b class='search-bold'>Pattern</b>: </td><td>" + dtPattern.value + "</td></tr>";
            }
            
            html += "<tr><td><b class='search-bold'>Commentaire(s)</b>: </td><td>" + commentary.value + "</td></tr>";
            
            // Périodes de maintenance
            html += "<tr><td colspan='2'><br/><h3 class='title-search'>Périodes de Maintenance</h3></td></tr>";
            html += "<tr><td colspan='2'>" + formatAllPeriods(downtime.value) + "</td></tr>";
            
            html += "</table></span></div>";
            
            $container.append(html);
        }
    });

    // ==================== INITIALISATION ====================
    var tableElement = mvc.Components.getInstance("highlight");
    tableElement.getVisualization(function (tableView) {
        tableView.addCellRenderer(new CustomRangeRenderer());
        tableView.addRowExpansionRenderer(new EventSearchBasedRowExpansionRenderer());
        tableView.render();
    });

});