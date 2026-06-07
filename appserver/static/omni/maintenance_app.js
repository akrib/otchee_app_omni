var APP_NAME = 'otchee_app_omni';
var APP_VERSION = '2.6.0';

console.log('%c %s', 'background:#222;color:#bada55',
  'Omni Maintenance App v' + APP_VERSION + ' charge');

require.config({
  paths: {
    'omni-jquery-ui': '../app/' + APP_NAME + '/omni/lib/jquery-ui.min'
  },
  shim: {
    'omni-jquery-ui': { deps: ['jquery'] }
  }
});

require([
  'underscore',
  'jquery',
  'splunkjs/mvc',
  'splunkjs/mvc/searchmanager',
  'splunkjs/mvc/utils',
  'omni-jquery-ui',
  'css!../app/' + APP_NAME + '/omni/lib/jquery-ui.min.css',
  'splunkjs/mvc/simplexml/ready!'
], function (_, $, mvc, SearchManager, utils) {

  'use strict';

  /* ============================================================
   * CONFIG
   * ============================================================ */
var Config = (function () {
  function urlParam(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)', 'i').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function tok(name) {
    var d = mvc.Components.get('default');
    var s = mvc.Components.getInstance('submitted');
    var v = d && (d.get(name) != null ? d.get(name) : d.get('form.' + name));
    if (v == null && s) v = (s.get(name) != null ? s.get(name) : s.get('form.' + name));
    return v == null ? null : v;
  }
  var $cfg = $('#omni_config');

  var mode = urlParam('mode') || tok('mode') || $cfg.attr('data-mode') || 'add';

  var dtId = urlParam('dt_id') || urlParam('DT_ID')
          || tok('DT_ID') || tok('dt_id')
          || $cfg.attr('data-dt-id')
          || null;

  var debug = (urlParam('debug') || $cfg.attr('data-debug') || '0') === '1';

  return {
    mode: mode, dtId: dtId, debug: debug,
    isCustom: /custom/.test(mode),
    isUpdate: /update/.test(mode),
    isDelete: mode === 'delete',
    view: utils.getPageInfo().page,
    appPath: APP_NAME
  };
})();

  /* ============================================================
   * LOG
   * ============================================================ */
  function log(obj, titre, level) {
    if (!Config.debug) return;
    var colors = ['#fff', '#ff0', '#f00'];
    console.groupCollapsed('%c Omni %s', 'color:' + (colors[level || 0]), titre || '');
    try { console.log(obj); } catch (e) {}
    console.groupEnd();
  }

  /* ============================================================
   * UTILS (helpers communs, portes depuis omni.js)
   * ============================================================ */
  var Utils = {
    isNull: function (v) {
      return v === '' || v === null || v === undefined || v === false;
    },
    isNotNull: function (v) { return !Utils.isNull(v); },

    createID: function () {
      var crypto = window.crypto || window.msCrypto;
      var arr = new Uint32Array(1);
      crypto.getRandomValues(arr);
      return (Date.now().toString(36) + crypto.getRandomValues(arr).toString(36).substr(2, 5)).toUpperCase();
    },

    todayDate: function () {
      var d = new Date();
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    },

    timeFormatOK: function (t) {
      return /^24:00|((([01][0-9])|(2[0-3])):[0-5][0-9])$/.test(t);
    },

    checkEmail: function (email) {
      return /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
        .test(String(email).toLowerCase());
    },

    // pour le KV : la virgule devient ; et le % devient *
    forKV: function (v) {
      if (!v) return v;
      return v.split(',').join(';').split('%').join('*');
    },

    daysToEnglish: function (text) {
      if (!text) return text;
      var map = {
        'Lundi': 'Monday', 'Mardi': 'Tuesday', 'Mercredi': 'Wednesday',
        'Jeudi': 'Thursday', 'Vendredi': 'Friday', 'Samedi': 'Saturday', 'Dimanche': 'Sunday'
      };
      var r = text;
      Object.keys(map).forEach(function (k) { r = r.split(k).join(map[k]); });
      return r;
    },

    removeAccents: function (text) {
      if (!text) return '';
      return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },

    escapeSPL: function (v) {
      if (Utils.isNull(v)) return '';
      return String(v)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    }
  };

  /* ============================================================
   * TOKENS
   * ============================================================ */
  var Tokens = {
    _def: function () { return mvc.Components.get('default', { create: true }); },
    _sub: function () { return mvc.Components.getInstance('submitted', { create: true }); },
    set: function (name, value) { this._def().set(name, value); this._sub().set(name, value); },
    unset: function (name) { this._def().unset(name); this._sub().unset(name); },
    get: function (name) {
      var d = this._def().get(name), s = this._sub().get(name);
      return (d !== undefined && d !== null) ? d : ((s !== undefined && s !== null) ? s : null);
    }
  };

  /* ============================================================
   * SEARCH HUB  -  loader global a pourcentage
   * ============================================================ */
  var SearchHub = {
    _active: {},

    run: function (id, spl, opts) {
      opts = opts || {};
      var sm = new SearchManager(_.extend({
        id: 'omni_' + id + '_' + Date.now(),
        preview: false,
        cache: false,
        autostart: true,
        search: opts.tokenSafe ? mvc.tokenSafe(spl) : spl,
        earliest_time: opts.earliest || '-24h@h',
        latest_time: opts.latest || 'now'
      }, opts.searchOpts || {}));

      if (Config.debug) {
        try { console.log('%c SPL [' + id + ']', 'color:#0bf;font-weight:bold', '\n' + spl); } catch (e) {}
      }

      var sid = sm.id;
      SearchHub._active[sid] = 0.01;
      SearchHub._render(opts.message);

      sm.on('search:progress', function (p) {
        var dp = (p && p.content && typeof p.content.doneProgress === 'number')
          ? p.content.doneProgress : 0;
        SearchHub._active[sid] = Math.max(0.01, dp);
        SearchHub._render(opts.message);
      });

      sm.on('search:done', function (p) {
        SearchHub._active[sid] = 1;
        SearchHub._render(opts.message);

        // ------------------------------------------------------------------
        // CORRECTION : lecture des resultats en 'json_rows'.
        // En 'json' SplunkJS expose .results (tableau d'objets) et PAS .rows,
        // ce qui faisait que onResults recevait toujours [] (=> aucun
        // prechargement en update/delete et listes vides).
        // On utilise donc 'json_rows' avec un filet de securite sur .results.
        // ------------------------------------------------------------------
        var rc = (p && p.content) ? p.content.resultCount : -1;
        if (opts.onResults && rc >= 0) {
          var rs = sm.data('results', { count: opts.count || 0, output_mode: 'json_rows' });
          rs.on('data', function () {
            var d = rs.data() || {};
            var fields = (d.fields || []).map(function (f) {
              return (typeof f === 'string') ? f : ((f && f.name) || f);
            });
            var rows = d.rows;
            if ((!rows || !rows.length) && d.results && d.results.length) {
              rows = d.results.map(function (o) {
                return fields.map(function (n) { return o[n]; });
              });
            }
            rows = rows || [];
            opts.onResults(rows, fields);
          });
          rs.on('error', function () { if (opts.onError) opts.onError(); });
        }
        if (opts.onDone) opts.onDone(p);
        delete SearchHub._active[sid];
        SearchHub._render(opts.message);
      });

      sm.on('search:failed search:error', function (p) {
        log(p, 'recherche en echec : ' + id, 2);
        delete SearchHub._active[sid];
        SearchHub._render(opts.message);
        if (opts.onError) opts.onError(p);
      });

      return sm;
    },

    _overall: function () {
      var keys = Object.keys(SearchHub._active);
      if (!keys.length) return 1;
      var sum = keys.reduce(function (a, k) { return a + SearchHub._active[k]; }, 0);
      return sum / keys.length;
    },

    _render: function (message) {
      var anyActive = Object.keys(SearchHub._active).length > 0;
      var $ld = $('#omni-loader');
      if (!$ld.length) return;
      if (!anyActive) { $ld.removeClass('is-visible'); return; }
      var pct = Math.round(SearchHub._overall() * 100);
      $ld.addClass('is-visible');
      $ld.find('.omni-loader__bar').css('width', Math.max(pct, 5) + '%');
      $ld.find('.omni-loader__pct').text(pct + '%');
      $ld.find('.omni-loader__msg-txt').text(message || 'Chargement des donnees…');
    }
  };

  /* ============================================================
   * UI  -  shell + composants
   * ============================================================ */
  var UI = {
    css: function () {
      if ($('#omni-app-style').length) return;
      var c = [
        ':root{--omni-primary:#1977cc;--omni-primary-2:#274685;--omni-accent:#fcb040;--omni-ok:#5cc05c;--omni-err:#d9534f;--omni-line:#e2e8f0;--omni-ink:#1f2933;--omni-muted:#647488;}',
        '#omni_maintenance_app{font-family:Poppins,system-ui,Segoe UI,Roboto,sans-serif;color:var(--omni-ink);max-width:1080px;margin:0 auto;}',
        '.omni-card{background:#fff;border:1px solid var(--omni-line);border-radius:14px;box-shadow:0 6px 24px rgba(20,40,70,.06);overflow:hidden;}',
        '.omni-header{display:flex;align-items:center;gap:16px;padding:18px 24px;background:linear-gradient(90deg,var(--omni-primary),var(--omni-primary-2));color:#fff;}',
        '.omni-header h1{font-size:20px;margin:0;font-weight:600;letter-spacing:.3px;color:#fff;}',
        '.omni-header .omni-badge{margin-left:auto;font-size:12px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;}',
        '.omni-back{display:inline-flex;align-items:center;gap:6px;color:var(--omni-primary);text-decoration:none;font-weight:600;margin:10px 4px;font-size:14px;}',
        '.omni-back:hover{text-decoration:underline;}',
        '.omni-steps{display:flex;padding:22px 24px 6px;gap:0;list-style:none;margin:0;}',
        '.omni-step{flex:1;text-align:center;position:relative;font-size:12.5px;color:var(--omni-muted);}',
        '.omni-step__dot{width:30px;height:30px;line-height:30px;border-radius:50%;background:#fff;border:2px solid var(--omni-line);margin:0 auto 8px;font-weight:600;transition:.25s;position:relative;z-index:1;}',
        '.omni-step::before,.omni-step::after{content:"";position:absolute;top:15px;height:2px;background:var(--omni-line);width:50%;z-index:0;}',
        '.omni-step::before{left:0;}.omni-step::after{right:0;}',
        '.omni-step:first-child::before,.omni-step:last-child::after{display:none;}',
        '.omni-step.is-active .omni-step__dot{border-color:var(--omni-primary);background:var(--omni-primary);color:#fff;}',
        '.omni-step.is-active{color:var(--omni-ink);font-weight:600;}',
        '.omni-step.is-done .omni-step__dot{border-color:var(--omni-ok);background:var(--omni-ok);color:#fff;}',
        '.omni-step.is-done::before,.omni-step.is-done::after{background:var(--omni-ok);}',
        '.omni-body{padding:8px 28px 24px;min-height:240px;}',
        '.omni-body h2{font-size:17px;margin:18px 0 4px;}',
        '.omni-body .omni-hint{color:var(--omni-muted);font-size:13px;margin:0 0 16px;}',
        '.omni-footer{display:flex;gap:12px;padding:16px 28px;border-top:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-btn{appearance:none;border:1px solid transparent;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;font-family:inherit;}',
        '.omni-btn:disabled{opacity:.45;cursor:not-allowed;}',
        '.omni-btn--primary{background:var(--omni-primary);color:#fff;}',
        '.omni-btn--primary:hover:not(:disabled){background:var(--omni-primary-2);}',
        '.omni-btn--ghost{background:#fff;color:var(--omni-muted);border-color:var(--omni-line);}',
        '.omni-btn--danger{background:var(--omni-err);color:#fff;}',
        '.omni-btn--ok{background:var(--omni-ok);color:#fff;}',
        '.omni-spacer{flex:1;}',
        '.omni-field{margin:14px 0;}',
        '.omni-field label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;}',
        '.omni-field select,.omni-field input[type=text],.omni-field textarea{height:45px;width:100%;box-sizing:border-box;border:1px solid var(--omni-line);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;}',
        '.omni-field select:focus,.omni-field input:focus,.omni-field textarea:focus{outline:none;border-color:var(--omni-primary);box-shadow:0 0 0 3px rgba(25,119,204,.12);}',
        '.omni-field--inline{display:inline-block;width:auto;margin-right:10px;vertical-align:top;}',
        '.omni-choices{display:flex;gap:8px;flex-wrap:wrap;}',
        '.omni-choice{border:1px solid var(--omni-line);border-radius:10px;padding:10px 16px;cursor:pointer;font-size:14px;background:#fff;transition:.15s;}',
        '.omni-choice.is-active{border-color:var(--omni-primary);background:rgba(25,119,204,.06);color:var(--omni-primary);font-weight:600;}',
        /* interrupteur status periode */
        '.omni-p-status-lbl{display:inline-flex;align-items:center;gap:8px;}',
        '.omni-p-status-lbl::before{content:"";width:14px;height:14px;border-radius:50%;background:var(--omni-err);display:inline-block;transition:.15s;}',
        '.omni-p-status-lbl.is-active{border-color:var(--omni-ok);background:rgba(92,192,92,.08);color:#2f7a2f;}',
        '.omni-p-status-lbl.is-active::before{background:var(--omni-ok);}',
        '.omni-tag{display:inline-block;background:#23579d;color:#fff;border-radius:6px;padding:3px 9px;margin:3px;font-size:13px;}',
        '.omni-pick{height:380px;border:1px solid var(--omni-line);border-radius:10px;width:100%;padding:4px;font-size:14px;}',
        '.omni-pick option{padding:6px 10px;line-height:1.5;border-radius:6px;white-space:normal;}',
        '.omni-pick option:checked{background:var(--omni-primary);color:#fff;}',
        '.omni-loupe{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;margin-left:8px;border:1px solid var(--omni-line);border-radius:6px;cursor:pointer;font-size:13px;vertical-align:middle;background:#fff;transition:.15s;}',
        '.omni-loupe:hover{border-color:var(--omni-primary);background:rgba(25,119,204,.08);}',
        '.omni-debug-pre{white-space:pre-wrap;font-size:12px;background:#0f2238;color:#d6e2f0;padding:12px;border-radius:8px;overflow:auto;max-height:340px;font-family:Menlo,Consolas,monospace;}',
        '.omni-debug-line{font-size:13px;margin-bottom:10px;}',
        '.omni-debug-line code{background:#eef2f6;padding:2px 6px;border-radius:4px;}',
        /* periodes */
        '.omni-ptabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 14px;}',
        '.omni-ptab{border:1px solid var(--omni-line);border-radius:10px 10px 0 0;padding:8px 14px;cursor:pointer;background:#f4f7fa;font-size:13px;display:flex;align-items:center;gap:8px;}',
        '.omni-ptab.is-active{background:#fff;border-bottom-color:#fff;color:var(--omni-primary);font-weight:600;}',
        '.omni-ptab__close{color:var(--omni-err);font-weight:700;cursor:pointer;}',
        '.omni-padd{border:1px dashed var(--omni-line);border-radius:10px;padding:8px 14px;cursor:pointer;background:#fff;color:var(--omni-primary);font-weight:600;font-size:13px;}',
        '.omni-pbody{border:1px solid var(--omni-line);border-radius:0 10px 10px 10px;padding:16px;}',
        '.omni-prow{display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin:10px 0;}',
        '.omni-time{width:90px !important;}',
        '.omni-days{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px;}',
        '.omni-days li{border:1px solid var(--omni-line);border-radius:8px;padding:6px 10px;cursor:pointer;font-size:13px;user-select:none;}',
        '.omni-days li.ui-selected,.omni-days li.is-sel{background:var(--omni-primary);color:#fff;border-color:var(--omni-primary);}',
        /* loader */
        '.omni-loader{position:fixed;left:50%;top:24px;transform:translateX(-50%);background:#0f2238;color:#fff;border-radius:12px;padding:14px 22px;min-width:280px;box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:.2s;z-index:9999;}',
        '.omni-loader.is-visible{opacity:1;}',
        '.omni-loader__msg{font-size:13px;margin-bottom:8px;display:flex;justify-content:space-between;}',
        '.omni-loader__track{height:8px;background:rgba(255,255,255,.18);border-radius:999px;overflow:hidden;}',
        '.omni-loader__bar{height:100%;width:5%;background:linear-gradient(90deg,var(--omni-accent),#ffd27a);border-radius:999px;transition:width .25s;}',
        /* modal */
        '.omni-modal{position:fixed;inset:0;background:rgba(15,34,56,.55);display:none;align-items:center;justify-content:center;z-index:10000;}',
        '.omni-modal.is-open{display:flex;}',
        '.omni-modal__box{background:#fff;border-radius:14px;width:min(520px,92vw);overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}',
        '.omni-modal__head{padding:16px 22px;background:#3c444d;color:#fff;font-weight:600;}',
        '.omni-modal__head.is-err{background:var(--omni-err);}.omni-modal__head.is-ok{background:var(--omni-ok);}',
        '.omni-modal__body{padding:20px 22px;font-size:14px;line-height:1.5;}',
        '.omni-modal__foot{padding:12px 22px;text-align:right;border-top:1px solid var(--omni-line);}',
        /* datepicker jquery-ui : remonte au dessus de la modal */
        '.ui-datepicker{z-index:10001 !important;}'
      ].join('\n');
      $('<style id="omni-app-style">').text(c).appendTo('head');
    },

    shell: function () {
      var titles = {
        add: 'Ajouter une maintenance', add_custom: 'Ajouter une maintenance custom',
        update: 'Modifier une maintenance', update_custom: 'Modifier une maintenance custom',
        delete: 'Supprimer une maintenance'
      };
      var html = ''
        + '<a class="omni-back" href="./accueil">&#8592; Menu des Maintenances</a>'
        + '<div class="omni-card">'
        + '  <div class="omni-header">'
        + '    <img src="/static/app/' + Config.appPath + '/media/logo_omni.png" style="height:34px" onerror="this.style.display=\'none\'"/>'
        + '    <h1>' + (titles[Config.mode] || 'Maintenance') + '</h1>'
        + '    <span class="omni-badge">' + Config.mode + '</span>'
        + '  </div>'
        + '  <ol class="omni-steps" id="omni-steps"></ol>'
        + '  <div class="omni-body" id="omni-body"></div>'
        + '  <div class="omni-footer" id="omni-footer">'
        + '    <button class="omni-btn omni-btn--ghost" id="omni-prev">Precedent</button>'
        + '    <span class="omni-spacer"></span>'
        + '    <button class="omni-btn omni-btn--primary" id="omni-next">Suivant</button>'
        + '    <button class="omni-btn omni-btn--ok" id="omni-finish" style="display:none">Valider</button>'
        + '  </div>'
        + '</div>'
        + '<div class="omni-loader" id="omni-loader">'
        + '  <div class="omni-loader__msg"><span class="omni-loader__msg-txt">Chargement…</span><span class="omni-loader__pct">0%</span></div>'
        + '  <div class="omni-loader__track"><div class="omni-loader__bar"></div></div>'
        + '</div>'
        + '<div class="omni-modal" id="omni-modal"><div class="omni-modal__box">'
        + '  <div class="omni-modal__head" id="omni-modal-head">Information</div>'
        + '  <div class="omni-modal__body" id="omni-modal-body"></div>'
        + '  <div class="omni-modal__foot"><button class="omni-btn omni-btn--primary" id="omni-modal-close">OK</button></div>'
        + '</div></div>';
      $('#omni_maintenance_app').html(html);
      $('#omni-modal-close').on('click', UI.closeModal);
    },

    modal: function (title, body, kind) {
      $('#omni-modal-head').attr('class', 'omni-modal__head' + (kind ? ' is-' + kind : '')).html(title);
      $('#omni-modal-body').html(body);
      $('#omni-modal').addClass('is-open');
    },
    closeModal: function () { $('#omni-modal').removeClass('is-open'); }
  };

  /* ============================================================
   * REQUETES SPL
   * ============================================================ */
  var SPL = {
    service: ''
      + '| rest splunk_server=local /servicesNS/nobody/SA-ITOA/itoa_interface/service report_as=text '
      + '| spath input=value path={} output=svcs | stats count by svcs '
      + '| spath input=svcs path=title output=service_title '
      + '| stats count as _c by service_title | table service_title',

    kpi: function () {
      var svc = (Tokens.get('service_selected') || '%');
      return ''
        + '| rest splunk_server=local /servicesNS/nobody/SA-ITOA/itoa_interface/service report_as=text '
        + '| spath input=value path={} output=svcs | stats count by svcs | fromjson svcs '
        + '| eval sd=replace("' + svc + '","\\*","%"), sd=split(lower(sd),";"), v=0, '
        + '  v=mvmap(sd,v+if(lower(title) LIKE(sd),1,0)), v=sum(v) | where v>0 '
        + '| stats count by kpis | spath input=kpis path=title output=kpi_title '
        + '| stats count as _c by kpi_title | table kpi_title';
    },

    entityTypes: ''
      + '| inputlookup itsi_entities | rename title as entity_title | fields entity_type_ids entity_title '
      + '| lookup itsi_entity_types _key as entity_type_ids OUTPUT title as entity_type '
      + '| fillnull value="No Entity Type" entity_type '
      + '| dedup entity_type | mvexpand entity_type | dedup entity_type | table entity_type',

    entity: function () {
      var svc = (Tokens.get('service_selected') || '%');
      var etype = (Tokens.get('entity_input_type') || '*');
      return ''
        + '| inputlookup itsi_entities | rename title as entity_title '
        + '| lookup service_kpi_lookup _key AS services._key OUTPUT title AS service_title '
        + '| lookup itsi_entity_types _key as entity_type_ids OUTPUT title as entity_type '
        + '| fillnull value="No Entity Type" entity_type | search entity_type="' + etype + '" '
        + '| eval sd=replace("' + svc + '","\\*","%"), sd=split(lower(sd),";"), v=0, '
        + '  service_title=if(isnull(service_title),"*",service_title), '
        + '  v=mvmap(sd,v+if(lower(service_title) LIKE(sd),1,0)), v=sum(v) | where v>0 '
        + '| stats count as _c by entity_title | table entity_title';
    },

    policies: '| inputlookup omni_kv_def | stats count as _c by dt_policy '
      + '| appendpipe [| stats count | where count=0 | eval dt_policy="-" | table dt_policy]',

    byId: function (id) {
      return ''
        + '| inputlookup omni_kv_def where ID="' + id + '" | rename _key as key '
        + '| rex field=step_opt "(?<service_type>.)(?<kpi_type>.)(?<entity_type>.)" '
        + '| eval downtime="[" + mvjoin(downtime,",") + "]", service=mvjoin(service,";"), '
        + '  kpi=mvjoin(kpi,";"), entity=mvjoin(entity,";") '
        + '| table key,downtime,service_type,service,kpi_type,kpi,entity_type,entity,dt_filter,dt_policy,commentary,version,dt_category';
    }
  };

  /* ============================================================
   * PERIODS  -  gestion complete des periodes (porte d'omni.js)
   * Construit des onglets dans un conteneur, gere les 4 types :
   * between_date / weekly / monthly / special_date_*
   * Chaque periode porte desormais son propre status (enabled/disabled).
   * ============================================================ */
  var Periods = (function () {
    var WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    var WEEK_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    var MONTH = [];
    for (var d = 1; d <= 31; d++) MONTH.push(String(d).padStart(2, '0'));
    var SPECIAL = [
      ['first', 'Premier du mois'], ['second', 'Deuxieme du mois'],
      ['third', 'Troisieme du mois'], ['fourth', 'Quatrieme du mois'], ['last', 'Dernier du mois']
    ];

    var seq = 0;          // compteur d'onglets crees
    var $tabs, $bodies;   // conteneurs

    function applyDatepickers(scope, minDate) {
      minDate = minDate || Utils.todayDate();
      var $from = $(scope + ' .omni-dp-begin');
      var $to = $(scope + ' .omni-dp-end');
      if (!$from.length || !$to.length) return;

      $from.datepicker({
        changeMonth: true, dateFormat: 'yy-mm-dd', minDate: minDate,
        onSelect: function (txt) {
          var sel = $.datepicker.parseDate('yy-mm-dd', txt);
          $to.datepicker('option', 'minDate', sel).prop('disabled', false);
          var end = $to.val();
          if (end && $.datepicker.parseDate('yy-mm-dd', end) < sel) $to.val('');
        }
      });
      $to.datepicker({ changeMonth: true, dateFormat: 'yy-mm-dd', minDate: minDate });

      var fromVal = $from.val();
      if (fromVal) {
        try {
          var fd = $.datepicker.parseDate('yy-mm-dd', fromVal);
          if (fd) $to.datepicker('option', 'minDate', fd).prop('disabled', false);
        } catch (e) {}
      } else {
        $to.prop('disabled', true);
      }
    }

    // construit la zone interne d'une periode selon son type
    function zoneHtml(pid, type, p) {
      p = p || {};
      var bt = (p.begin_time || '00:00:00').substr(0, 5);
      var et = (p.end_time || '24:00:00').substr(0, 5);
      var times = ''
        + '<div class="omni-prow">'
        + '  <div class="omni-field omni-field--inline"><label>Heure de debut</label>'
        + '    <input type="text" class="omni-time omni-p-begin" maxlength="5" value="' + bt + '"></div>'
        + '  <div class="omni-field omni-field--inline"><label>Heure de fin</label>'
        + '    <input type="text" class="omni-time omni-p-end" maxlength="5" value="' + et + '"></div>'
        + '</div>';

      if (type === 'between_date') {
        return ''
          + '<div class="omni-prow">'
          + '  <div class="omni-field omni-field--inline" style="width:180px"><label>Date de debut</label>'
          + '    <input type="text" class="omni-dp-begin" readonly value="' + (p.begin_date || '') + '"></div>'
          + '  <div class="omni-field omni-field--inline" style="width:180px"><label>Date de fin</label>'
          + '    <input type="text" class="omni-dp-end" readonly value="' + (p.end_date || '') + '"></div>'
          + '</div>' + times;
      }

      if (type === 'weekly' || type === 'monthly') {
        var list = (type === 'weekly') ? WEEK_FR : MONTH;
        var sel = (p.begin_date || '').split(';');
        // en update les jours sont stockes en anglais -> on retraduit pour l'affichage hebdo
        var selFr = sel.map(function (x) {
          var i = WEEK.indexOf(x); return i >= 0 ? WEEK_FR[i] : x;
        });
        var lis = list.map(function (j) {
          var on = (type === 'weekly' ? selFr : sel).indexOf(j) !== -1;
          return '<li class="' + (on ? 'is-sel' : '') + '">' + j + '</li>';
        }).join('');
        return ''
          + '<div class="omni-field"><label>Jours</label>'
          + '  <ol class="omni-days omni-p-days">' + lis + '</ol>'
          + '  <p class="omni-hint">Cliquez pour (de)selectionner un ou plusieurs jours.</p></div>'
          + times;
      }

      // special_date_*
      var occ = 'first';
      if (p.dt_type && p.dt_type.indexOf('special_date_') === 0) {
        occ = p.dt_type.replace('special_date_', '').replace('_in_month', '');
      }
      var dayOpts = WEEK_FR.map(function (j) {
        return '<option value="' + j + '"' + (p.begin_date === j ? ' selected' : '') + '>' + j + '</option>';
      }).join('');
      var occOpts = SPECIAL.map(function (s) {
        return '<option value="' + s[0] + '"' + (occ === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('');
      return ''
        + '<div class="omni-prow">'
        + '  <div class="omni-field omni-field--inline"><label>Jour</label>'
        + '    <select class="omni-p-sday">' + dayOpts + '</select></div>'
        + '  <div class="omni-field omni-field--inline"><label>Occurrence</label>'
        + '    <select class="omni-p-stype">' + occOpts + '</select></div>'
        + '</div>' + times;
    }

    function rebuildZone(pid, type) {
      var $body = $('#' + pid);
      $body.find('.omni-p-zone').html(zoneHtml(pid, type, {}));
      if (type === 'between_date') applyDatepickers('#' + pid);
      if (type === 'weekly' || type === 'monthly') bindDays($body);
    }

    function bindDays($body) {
      $body.find('.omni-p-days li').off('click').on('click', function () {
        $(this).toggleClass('is-sel');
      });
    }

    // interrupteur enabled/disabled propre a chaque periode
    function bindStatus($body) {
      $body.find('.omni-p-status').off('change').on('change', function () {
        var on = this.checked;
        $(this).closest('.omni-p-status-lbl').toggleClass('is-active', on);
        $body.find('.omni-p-status-txt').text(on
          ? 'Periode active (enabled)'
          : 'Periode inactive (disabled)');
      });
    }

    function addTab(p) {
      p = p || { dt_type: 'between_date' };
      var n = ++seq;
      var pid = 'omni-period-' + n;
      var type = p.dt_type || 'between_date';
      var baseType = (type.indexOf('special_date_') === 0) ? 'special' : type;

      // status de la periode (enabled par defaut)
      var statusOn = !(p && p.status === 'disabled');
      var statusBox = ''
        + '<div class="omni-field omni-p-statuswrap" style="margin:0 0 12px">'
        + '  <label class="omni-choice omni-p-status-lbl' + (statusOn ? ' is-active' : '') + '" style="padding:8px 14px">'
        + '    <input type="checkbox" class="omni-p-status" hidden' + (statusOn ? ' checked' : '') + '>'
        + '    <span class="omni-p-status-txt">' + (statusOn ? 'Periode active (enabled)' : 'Periode inactive (disabled)') + '</span>'
        + '  </label>'
        + '  <p class="omni-hint" style="margin:6px 0 0">Definit le status (enabled/disabled) enregistre dans le json de cette periode.</p>'
        + '</div>';

      var radios = ''
        + '<div class="omni-choices" style="margin-bottom:14px">'
        + '  <label class="omni-choice' + (baseType === 'between_date' ? ' is-active' : '') + '"><input type="radio" name="t-' + pid + '" value="between_date" hidden ' + (baseType === 'between_date' ? 'checked' : '') + '> Date a date</label>'
        + '  <label class="omni-choice' + (baseType === 'weekly' ? ' is-active' : '') + '"><input type="radio" name="t-' + pid + '" value="weekly" hidden ' + (baseType === 'weekly' ? 'checked' : '') + '> Hebdomadaire</label>'
        + '  <label class="omni-choice' + (baseType === 'monthly' ? ' is-active' : '') + '"><input type="radio" name="t-' + pid + '" value="monthly" hidden ' + (baseType === 'monthly' ? 'checked' : '') + '> Mensuel</label>'
        + '  <label class="omni-choice' + (baseType === 'special' ? ' is-active' : '') + '"><input type="radio" name="t-' + pid + '" value="special" hidden ' + (baseType === 'special' ? 'checked' : '') + '> Specifique</label>'
        + '</div>';

      $bodies.append('<div class="omni-pbody" id="' + pid + '" data-n="' + n + '">'
        + statusBox + radios + '<div class="omni-p-zone"></div></div>');

      $tabs.find('.omni-padd').before('<div class="omni-ptab" data-target="' + pid + '">'
        + 'Periode ' + n + ' <span class="omni-ptab__close" title="Supprimer">&times;</span></div>');

      // zone initiale
      var $body = $('#' + pid);
      $body.find('.omni-p-zone').html(zoneHtml(pid, (baseType === 'special' ? type : baseType), p));
      if (baseType === 'between_date') applyDatepickers('#' + pid);
      if (baseType === 'weekly' || baseType === 'monthly') bindDays($body);

      // interrupteur status
      bindStatus($body);

      // changement de type
      $body.find('input[name="t-' + pid + '"]').on('change', function () {
        $body.find('.omni-choices .omni-choice').removeClass('is-active');
        $(this).closest('.omni-choice').addClass('is-active');
        var v = $(this).val();
        $body.find('.omni-p-zone').html(zoneHtml(pid, (v === 'special' ? 'special_date_first_in_month' : v), {}));
        if (v === 'between_date') applyDatepickers('#' + pid);
        if (v === 'weekly' || v === 'monthly') bindDays($body);
      });

      activate(pid);
    }

    function activate(pid) {
      $tabs.find('.omni-ptab').removeClass('is-active');
      $tabs.find('.omni-ptab[data-target="' + pid + '"]').addClass('is-active');
      $bodies.find('.omni-pbody').hide();
      $('#' + pid).show();
    }

    function init($mount, preload) {
      seq = 0;
      $mount.html(''
        + '<div class="omni-ptabs" id="omni-ptabs"><div class="omni-padd">+ Ajouter une periode</div></div>'
        + '<div id="omni-pbodies"></div>');
      $tabs = $mount.find('#omni-ptabs');
      $bodies = $mount.find('#omni-pbodies');

      $tabs.on('click', '.omni-padd', function () { addTab(); });
      $tabs.on('click', '.omni-ptab', function (e) {
        if ($(e.target).hasClass('omni-ptab__close')) {
          var tgt = $(this).data('target');
          $('#' + tgt).remove();
          $(this).remove();
          var $first = $bodies.find('.omni-pbody').first();
          if ($first.length) activate($first.attr('id'));
          return;
        }
        activate($(this).data('target'));
      });

      var list = [];
      if (preload) {
        try {
          // 1. On décode le tableau principal
          var j = JSON.parse(preload);
          var rawList = Array.isArray(j) ? j : [j];

          // 2. CORRECTION : On décode chaque élément s'il est encore sous forme de chaîne textuelle
          list = rawList.map(function (item) {
            if (typeof item === 'string') {
              try {
                return JSON.parse(item);
              } catch (err) {
                console.error("Impossible de parser la période individuelle :", item, err);
                return null;
              }
            }
            return item; // Si c'est déjà un objet, on le garde tel quel
          }).filter(Boolean); // On retire les éventuels parsings en échec (null)

        } catch (e) {
          // Ancien format de repli type#begin#end#bt#et[#status] séparé par £
          list = (preload || '').split('£').map(function (s) {
            var a = s.split('#');
            if (a.length < 5) return null;
            return {
              dt_type: a[0],
              begin_date: a[1],
              end_date: a[2],
              begin_time: a[3],
              end_time: a[4],
              status: a[5] || 'enabled'
            };
          }).filter(Boolean);
        }
      }

      // Ensuite, ton code va pouvoir boucler proprement sur des vrais objets :
      list.forEach(function(periode) {
        addTab(periode);
      });
      // affiche la 1ere
      var $f = $bodies.find('.omni-pbody').first();
      if ($f.length) activate($f.attr('id'));
    }

    // collecte + validation -> { downtimeFields, errors, errorOutput }
    function collect() {
      var fields = [], errors = 0, out = '', any = 0, num = 0;

      $bodies.find('.omni-pbody').each(function () {
        num++;
        var $b = $(this);
        var type = $b.find('input[name^="t-"]:checked').val() || 'between_date';
        var beginDate = '', endDate = '', dtType = type;

        if (type === 'between_date') {
          beginDate = $b.find('.omni-dp-begin').val();
          endDate = $b.find('.omni-dp-end').val();
          if (!beginDate || beginDate.length !== 10) { errors++; out += '- <b>Periode ' + num + '</b> : date de debut manquante<br/>'; }
          if (!endDate || endDate.length !== 10) { errors++; out += '- <b>Periode ' + num + '</b> : date de fin manquante<br/>'; }
          if (beginDate && endDate && new Date(endDate) < new Date(beginDate)) {
            errors++; out += '- <b>Periode ' + num + '</b> : la date de fin doit etre posterieure a la date de debut<br/>';
          }
          if (beginDate || endDate) any = 1;
        } else if (type === 'weekly' || type === 'monthly') {
          var days = [];
          $b.find('.omni-p-days li.is-sel').each(function () { days.push($(this).text()); });
          if (!days.length) { errors++; out += '- <b>Periode ' + num + '</b> : selectionnez au moins un jour<br/>'; }
          else any = 1;
          beginDate = days.join(';'); endDate = days.join(';');
        } else { // special
          var day = $b.find('.omni-p-sday').val();
          var occ = $b.find('.omni-p-stype').val();
          beginDate = day; endDate = day;
          dtType = 'special_date_' + occ + '_in_month';
          any = 1;
        }

        var bt = $b.find('.omni-p-begin').val();
        var et = $b.find('.omni-p-end').val();
        if (!Utils.timeFormatOK(bt)) { errors++; out += '- <b>Periode ' + num + '</b> : heure de debut invalide (HH:MM)<br/>'; }
        if (!Utils.timeFormatOK(et)) { errors++; out += '- <b>Periode ' + num + '</b> : heure de fin invalide (HH:MM)<br/>'; }
        if (bt === et && beginDate === endDate) { errors++; out += '- <b>Periode ' + num + '</b> : heures debut/fin identiques<br/>'; }

        // status de la periode (enabled par defaut si l'interrupteur est absent)
        var $st = $b.find('.omni-p-status');
        var periodStatus = ($st.length ? $st.is(':checked') : true) ? 'enabled' : 'disabled';

        fields.push({
          dt_type: dtType,
          status: periodStatus,
          begin_date: Utils.forKV(Utils.daysToEnglish(beginDate || '')),
          end_date: Utils.forKV(Utils.daysToEnglish(endDate || '')),
          begin_time: (bt || '00:00') + ':00',
          end_time: (et || '24:00') + ':00'
        });
      });

      if (!any) { errors++; out += '- Au moins une periode complete est requise<br/>'; }
      return { downtimeFields: fields, errors: errors, errorOutput: out };
    }

    return { init: init, collect: collect };
  })();

  /* ============================================================
   * QUERY BUILDER  -  genere le SPL final (porte d'omni.js)
   * ============================================================ */
  var QueryBuilder = {
    create: function (sel, action) {
      var dtUpdate = new Date().getTime();

      // periodes valides
      var dtField = (sel.downtimeFields || []).filter(function (f) { return f; });

      // status PAR periode : force a "disabled" en suppression, sinon on
      // respecte la valeur portee par la periode (enabled/disabled), avec
      // repli sur "enabled".
      var perStatus = dtField.map(function (f) {
        if (action === 'delete') return 'disabled';
        return (f.status === 'enabled' || f.status === 'disabled') ? f.status : 'enabled';
      });

      // status GLOBAL de la maintenance (champ hors json / colonne KV) :
      // "disabled" en suppression, sinon "enabled" des qu'au moins une
      // periode est active, "disabled" si toutes les periodes sont inactives.
      var globalStatus = (action === 'delete')
        ? 'disabled'
        : (perStatus.indexOf('enabled') !== -1 ? 'enabled' : 'disabled');

      // chaque periode embarque desormais son propre status dans le json
      var dtJson = dtField.map(function (f, i) {
        return {
          id: sel.ID + '_' + (i + 1),
          dt_type: f.dt_type || '',
          begin_date: f.begin_date || '',
          end_date: f.end_date || '',
          begin_time: f.begin_time || '',
          end_time: f.end_time || '',
          status: perStatus[i],
          dt_filter: sel.dt_filter || '',
          dt_policy: sel.dt_policy || ''
        };
      });
      var dtStr = Utils.escapeSPL(JSON.stringify(dtJson));

      var keyLine = (action !== 'add') ? 'key="' + sel.key + '",\n        ' : '';

      // CORRECTION : Utilisation de makeresults pour éviter les timeouts
      var base = '| makeresults\n'
        + '| eval ' + keyLine
        + 'service=split("' + Utils.escapeSPL(sel.service) + '",";"),\n'
        + '    kpi=split("' + Utils.escapeSPL(sel.kpi) + '",";"),\n'
        + '    entity=split("' + Utils.escapeSPL(sel.entity) + '",";"),\n'
        + '    dt_filter="' + Utils.escapeSPL(sel.dt_filter) + '",\n'
        + '    dt_policy="' + Utils.escapeSPL(sel.dt_policy || '') + '",\n'
        + '    dt_category="' + Utils.escapeSPL(sel.dt_category || '') + '",\n'
        + '    downtime="' + dtStr + '",\n'
        + '    creator="' + Utils.escapeSPL(sel.username) + '",\n'
        + '    commentary="' + Utils.escapeSPL(sel.commentary) + '",\n'
        + '    version="' + sel.version + '",\n'
        + '    ID="' + sel.ID + '",\n'
        + '    dt_update=' + dtUpdate + ',\n'
        + '    step_opt="' + sel.step_opt + '",\n'
        + '    status="' + globalStatus + '"';

      return base + ' | OmniKVUpdate action="' + action + '" ' + (sel.sendEmail || '');
    }
  };

  /* ============================================================
   * FACTORY  -  etape de "portee" (Service / KPI / Entity)
   * ============================================================ */
  function makeScopeStep(opts) {
    return {
      id: opts.id,
      label: opts.label,
      render: function ($body) {
        var pre = '';
        if (opts.id === 'entity') {
          pre = '<div class="omni-field"><label>Type d\'entite</label>'
            + '<select id="entity-type-sel"><option>Chargement…</option></select></div>';
        }
        $body.html(''
          + '<h2>' + opts.title + '</h2>'
          + '<p class="omni-hint">' + (opts.hint || '') + '</p>'
          + pre
          + '<div class="omni-field"><label>Type de selection</label>'
          + '  <div class="omni-choices" id="' + opts.id + '-mode">'
          + '    <div class="omni-choice" data-v="1">Tous</div>'
          + '    <div class="omni-choice" data-v="2">Liste</div>'
          + '    <div class="omni-choice" data-v="3">Wildcard</div>'
          + '  </div></div>'
          + '<div id="' + opts.id + '-zone"></div>');

        var step = this;

        if (opts.id === 'entity') {
          var $et = $body.find('#entity-type-sel');
          SearchHub.run('entity_types', SPL.entityTypes, {
            message: 'Chargement des types d\'entite…',
            onResults: function (rows) {
              var h = '<option value="*">-- Tous --</option>';
              rows.forEach(function (r) { if (r[0]) h += '<option>' + r[0] + '</option>'; });
              $et.html(h);
              var preT = Tokens.get('entity_input_type');
              if (preT) $et.val(preT);
              Tokens.set('entity_input_type', $et.val());
              $et.on('change', function () { Tokens.set('entity_input_type', $(this).val()); });
            }
          });
        }

        $body.find('#' + opts.id + '-mode .omni-choice').on('click', function () {
          $body.find('#' + opts.id + '-mode .omni-choice').removeClass('is-active');
          $(this).addClass('is-active');
          step._renderMode($body, $(this).attr('data-v'));
        });

        var cur = Tokens.get(opts.id + '_select_input_type');
        $body.find('#' + opts.id + '-mode .omni-choice[data-v="' + (cur || '1') + '"]').trigger('click');
      },

      _renderMode: function ($body, type) {
        Tokens.set(opts.id + '_select_input_type', type);
        var $zone = $body.find('#' + opts.id + '-zone').empty();

        if (type === '1') {
          Tokens.set(opts.tokenSelected, '%');
          $zone.html('<p class="omni-hint">Toutes les valeurs seront prises en compte (<b>%</b>).</p>');
        } else if (type === '3') {
          $zone.html('<div class="omni-field"><label>Wildcard (ex : *prod*)</label>'
            + '<input type="text" id="' + opts.id + '-wc" placeholder="*prod*"></div>');
          var pre = Tokens.get(opts.tokenSelected) || '';
          $zone.find('#' + opts.id + '-wc').val(pre).on('input', function () {
            var v = $(this).val().trim();
            if (v) Tokens.set(opts.tokenSelected, v); else Tokens.unset(opts.tokenSelected);
          });
        } else {
          Tokens.unset(opts.tokenSelected);
          var loupe = Config.debug
            ? ' <span class="omni-loupe" id="' + opts.id + '-loupe" title="Debug : voir la requete SPL">&#128269;</span>'
            : '';
          $zone.html('<div class="omni-field"><label>' + opts.title + loupe
            + '</label><select multiple class="omni-pick" id="' + opts.id + '-list"></select>'
            + '<p class="omni-hint">Maintenez Ctrl/Cmd pour selectionner plusieurs valeurs.</p></div>');
          var $sel = $zone.find('#' + opts.id + '-list');

          // loupe debug : affiche la requete SPL + le token courant + nb de resultats
          if (Config.debug) {
            $zone.find('#' + opts.id + '-loupe').on('click', function () {
              var spl = opts.splFn();
              var escaped = spl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
              var nb = $sel.find('option').not('[value="%"]').length;
              UI.modal('Debug &mdash; ' + opts.label,
                '<div class="omni-debug-line">Token <code>' + opts.tokenSelected + '</code> = <code>'
                + (Tokens.get(opts.tokenSelected) || '&#8709;') + '</code></div>'
                + '<div class="omni-debug-line">Type de selection <code>'
                + (Tokens.get(opts.id + '_select_input_type') || '?') + '</code> &middot; '
                + nb + ' valeur(s) chargee(s)</div>'
                + '<div class="omni-debug-line">Requete SPL :</div>'
                + '<pre class="omni-debug-pre">' + escaped + '</pre>');
            });
          }
          SearchHub.run(opts.id + '_list', opts.splFn(), {
            message: 'Chargement des ' + opts.label.toLowerCase() + '…',
            count: 0,
            onResults: function (rows) {
              var h = '<option value="%">-- Tous --</option>';
              rows.forEach(function (r) { if (r[0]) h += '<option value="' + r[0] + '">' + r[0] + '</option>'; });
              $sel.html(h);
              var pre = (Tokens.get(opts.tokenSelected) || '').split(';');
              $sel.find('option').each(function () {
                if (pre.indexOf($(this).val()) !== -1) $(this).prop('selected', true);
              });
              $sel.on('change', function () {
                var vals = $sel.val() || [];
                if (vals.indexOf('%') !== -1) vals = ['%'];
                if (vals.length) Tokens.set(opts.tokenSelected, vals.join(';'));
                else Tokens.unset(opts.tokenSelected);
              });
            },
            onError: function () { $sel.html('<option>Erreur de chargement</option>'); }
          });
        }
      },

      validate: function () {
        var v = Tokens.get(opts.tokenSelected);
        return (v !== null && v !== undefined && v !== '')
          ? true : 'Veuillez renseigner : ' + opts.label;
      }
    };
  }

  /* ============================================================
   * ETAPE FILTRE CUSTOM
   * ============================================================ */
  var StepCustomFilter = {
    id: 'filter', label: 'Filtre custom',
    OPS: {
      string: [['=', 'Egal a'], ['!=', 'Different de'], ['isnull()', 'Est vide'],
               ['isnotnull()', 'N\'est pas vide'], ['LIKE', 'Contient'],
               ['LIKEC', 'Commence par'], ['LIKEF', 'Finit par']],
      number: [['=', 'Egal a'], ['!=', 'Different de'], ['<=', 'Plus petit ou egal'],
               ['>=', 'Plus grand ou egal'], ['<', 'Plus petit que'], ['>', 'Plus grand que'],
               ['isnull()', 'Est vide'], ['isnotnull()', 'N\'est pas vide']]
    },

    render: function ($body) {
      var self = this;
      $body.html(''
        + '<h2>Filtre personnalise</h2>'
        + '<p class="omni-hint">Construisez un filtre sur 1 ou 2 champs.</p>'
        + '<div id="cf-1"></div>'
        + '<div class="omni-field"><label><input type="checkbox" id="cf-sup"> Ajouter un deuxieme champ</label></div>'
        + '<div id="cf-op" style="display:none"><div class="omni-field"><label>Operateur logique</label>'
        + '<select id="cf-logic"><option>AND</option><option>OR</option></select></div></div>'
        + '<div id="cf-2" style="display:none"></div>'
        + '<div class="omni-field"><label>Apercu du filtre</label>'
        + '<input type="text" id="cf-preview" readonly></div>');

      this._renderField($body.find('#cf-1'), 1);
      this._renderField($body.find('#cf-2'), 2);

      $body.find('#cf-sup').on('change', function () {
        var on = this.checked;
        $body.find('#cf-op, #cf-2').toggle(on);
        self._recompute($body);
      });
      $body.find('#cf-logic').on('change', function () { self._recompute($body); });

      // ------------------------------------------------------------------
      // CORRECTION (update_custom) : reconstruction de l'UI a partir du
      // filtre dt_filter deja enregistre. Sans ca, _recompute() ecrasait
      // le token avec une valeur vide et le filtre existant etait perdu.
      // ------------------------------------------------------------------
      var pre = Tokens.get('dt_filter_selected');
      if (pre && String(pre).trim() && pre !== 'omni_skip_filter=1') {
        var parsed = self._parse(pre);
        if (parsed) {
          self._applyField($body.find('#cf-1'), parsed.fields[0]);
          if (parsed.fields[1]) {
            $body.find('#cf-sup').prop('checked', true);
            $body.find('#cf-op, #cf-2').show();
            $body.find('#cf-logic').val(parsed.logic);
            self._applyField($body.find('#cf-2'), parsed.fields[1]);
          }
        } else {
          // filtre non decomposable -> mode brut editable (aucune perte)
          self._renderRaw($body, pre);
          return;
        }
      }

      this._recompute($body);
    },

    _renderField: function ($c, idx) {
      var self = this;
      $c.html(''
        + '<div class="omni-prow">'
        + '  <label class="omni-choice cf-not" style="padding:8px 12px"><input type="checkbox" class="cf-not-chk" hidden> NOT</label>'
        + '  <div class="omni-field omni-field--inline" style="width:200px"><label>Nom du champ</label>'
        + '    <input type="text" class="cf-name"></div>'
        + '  <div class="omni-field omni-field--inline" style="width:130px"><label>Type</label>'
        + '    <select class="cf-type"><option value="string">string</option><option value="number">number</option></select></div>'
        + '  <div class="omni-field omni-field--inline" style="width:170px"><label>Operateur</label>'
        + '    <select class="cf-op"></select></div>'
        + '  <div class="omni-field omni-field--inline" style="width:170px"><label>Valeur</label>'
        + '    <input type="text" class="cf-val"></div>'
        + '</div>');

      function fillOps() {
        var t = $c.find('.cf-type').val();
        var h = self.OPS[t].map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
        $c.find('.cf-op').html(h);
      }
      fillOps();

      $c.find('.cf-type').on('change', function () { fillOps(); self._recompute($c.closest('.omni-body')); });
      $c.find('.cf-not-chk').on('change', function () {
        $(this).closest('.cf-not').toggleClass('is-active', this.checked);
        self._recompute($c.closest('.omni-body'));
      });
      $c.find('.cf-name, .cf-val, .cf-op').on('input change', function () {
        self._recompute($c.closest('.omni-body'));
      });
    },

    _expr: function ($c) {
      var not = $c.find('.cf-not-chk').is(':checked') ? 'NOT ' : '';
      var name = ($c.find('.cf-name').val() || '').trim();
      var type = $c.find('.cf-type').val();
      var op = $c.find('.cf-op').val();
      var val = ($c.find('.cf-val').val() || '').trim();
      if (!name) return '';

      if (op === 'isnull()') return not + 'isnull(' + name + ')';
      if (op === 'isnotnull()') return not + 'isnotnull(' + name + ')';

      var q = (type === 'string') ? '"' : '';
      if (op === 'LIKE') return not + name + ' LIKE ' + q + '%' + val + '%' + q;
      if (op === 'LIKEC') return not + name + ' LIKE ' + q + val + '%' + q;
      if (op === 'LIKEF') return not + name + ' LIKE ' + q + '%' + val + q;
      return not + name + op + q + val + q;
    },

    _recompute: function ($body) {
      var e1 = this._expr($body.find('#cf-1'));
      var out = e1;
      if ($body.find('#cf-sup').is(':checked')) {
        var e2 = this._expr($body.find('#cf-2'));
        if (e2) out = e1 + ' ' + $body.find('#cf-logic').val() + ' ' + e2;
      }
      $body.find('#cf-preview').val(out);
      if (out) Tokens.set('dt_filter_selected', out);
      else Tokens.unset('dt_filter_selected');
    },

    /* ----------------------------------------------------------
     * PARSING DU FILTRE EXISTANT (nouveau)
     * Reconstruit, a partir de la chaine SPL stockee, jusqu'a deux
     * descripteurs { not, name, type, op, val } + un operateur logique.
     * Renvoie null si la chaine n'est pas decomposable -> mode brut.
     * ---------------------------------------------------------- */

    // coupe la chaine sur le 1er AND/OR de 1er niveau (hors guillemets)
    _splitLogic: function (str) {
      var inQ = false;
      for (var i = 0; i < str.length; i++) {
        var ch = str.charAt(i);
        if (ch === '"') { inQ = !inQ; continue; }
        if (inQ) continue;
        if (str.substr(i, 5).toUpperCase() === ' AND ') {
          return { logic: 'AND', a: str.slice(0, i), b: str.slice(i + 5) };
        }
        if (str.substr(i, 4).toUpperCase() === ' OR ') {
          return { logic: 'OR', a: str.slice(0, i), b: str.slice(i + 4) };
        }
      }
      return null;
    },

    // parse UNE expression simple -> descripteur ou null
    _parseExpr: function (str) {
      str = (str || '').trim();
      if (!str) return null;

      var not = false;
      if (/^NOT\s+/i.test(str)) { not = true; str = str.replace(/^NOT\s+/i, '').trim(); }

      var m;

      // isnull(name) / isnotnull(name)
      m = /^isnotnull\(\s*([^)]+?)\s*\)$/i.exec(str);
      if (m) return { not: not, name: m[1].trim(), type: 'string', op: 'isnotnull()', val: '' };
      m = /^isnull\(\s*([^)]+?)\s*\)$/i.exec(str);
      if (m) return { not: not, name: m[1].trim(), type: 'string', op: 'isnull()', val: '' };

      // name LIKE "..."  ou name LIKE ...
      m = /^(.+?)\s+LIKE\s+(.+)$/i.exec(str);
      if (m) {
        var lname = m[1].trim();
        var rhs = m[2].trim();
        var isStr = /^".*"$/.test(rhs);
        var inner = isStr ? rhs.slice(1, -1) : rhs;
        var starts = inner.charAt(0) === '%';
        var ends = inner.charAt(inner.length - 1) === '%';
        var op = 'LIKE', val = inner;
        if (starts && ends) { op = 'LIKE'; val = inner.replace(/^%/, '').replace(/%$/, ''); }
        else if (ends) { op = 'LIKEC'; val = inner.replace(/%$/, ''); }   // val%  -> commence par
        else if (starts) { op = 'LIKEF'; val = inner.replace(/^%/, ''); } // %val  -> finit par
        else { op = 'LIKE'; val = inner; }
        return { not: not, name: lname, type: isStr ? 'string' : 'number', op: op, val: val };
      }

      // name <op> value  (op : <= >= != < > =)
      m = /^(.+?)\s*(<=|>=|!=|<|>|=)\s*(.*)$/.exec(str);
      if (m) {
        var nm = m[1].trim();
        var operator = m[2];
        var rest = m[3].trim();
        var isS = /^".*"$/.test(rest);
        var value = isS ? rest.slice(1, -1) : rest;
        return { not: not, name: nm, type: isS ? 'string' : 'number', op: operator, val: value };
      }

      return null;
    },

    // parse le filtre complet -> { logic, fields:[...] } ou null
    _parse: function (filter) {
      filter = (filter || '').trim();
      if (!filter || filter === 'omni_skip_filter=1') return null;

      var split = this._splitLogic(filter);
      if (split) {
        var e1 = this._parseExpr(split.a);
        var e2 = this._parseExpr(split.b);
        if (e1 && e2) return { logic: split.logic, fields: [e1, e2] };
      }
      var single = this._parseExpr(filter);
      if (single) return { logic: 'AND', fields: [single] };
      return null;
    },

    // pose les valeurs d'un descripteur dans un bloc de champ
    _applyField: function ($c, f) {
      if (!f) return;
      $c.find('.cf-not-chk').prop('checked', !!f.not);
      $c.find('.cf-not').toggleClass('is-active', !!f.not);
      $c.find('.cf-name').val(f.name || '');
      // on positionne le type PUIS on declenche le rebuild de la liste d'operateurs
      $c.find('.cf-type').val(f.type === 'number' ? 'number' : 'string').trigger('change');
      $c.find('.cf-op').val(f.op || '=');
      $c.find('.cf-val').val(f.val || '');
    },

    // repli : filtre non decomposable -> edition brute (on ne perd rien)
    _renderRaw: function ($body, filter) {
      $body.html(''
        + '<h2>Filtre personnalise</h2>'
        + '<p class="omni-hint">Le filtre existant n\'a pas pu etre decompose en champs. '
        + 'Vous pouvez le consulter et le modifier directement ci-dessous.</p>'
        + '<div class="omni-field"><label>Filtre (SPL brut)</label>'
        + '<textarea id="cf-raw" rows="3"></textarea></div>'
        + '<div class="omni-field"><label>Apercu du filtre</label>'
        + '<input type="text" id="cf-preview" readonly></div>');
      var $raw = $body.find('#cf-raw').val(filter);
      $body.find('#cf-preview').val(filter);
      Tokens.set('dt_filter_selected', filter);
      $raw.on('input', function () {
        var v = ($(this).val() || '').trim();
        $body.find('#cf-preview').val(v);
        if (v) Tokens.set('dt_filter_selected', v); else Tokens.unset('dt_filter_selected');
      });
    },

    // prechargement en update_custom : stocke le filtre existant (lu par render)
    preload: function (filter) {
      if (!filter) return;
      // on garde le filtre tel quel ; render() le reconstruira dans l'UI
      Tokens.set('dt_filter_selected', filter);
    },

    validate: function () {
      var v = Tokens.get('dt_filter_selected');
      return (v && v.trim()) ? true : 'Le filtre custom est requis.';
    }
  };

  /* ============================================================
   * ETAPE SOURCE / POLICY
   * ============================================================ */
  var StepPolicy = {
    id: 'policy', label: 'Source',
    render: function ($body) {
      $body.html(''
        + '<h2>Source / Policy</h2>'
        + '<p class="omni-hint">Choisissez une source existante ou creez-en une nouvelle.</p>'
        + '<div class="omni-field"><label>Type</label>'
        + '  <div class="omni-choices" id="pol-mode">'
        + '    <div class="omni-choice" data-v="exist">Existante</div>'
        + '    <div class="omni-choice" data-v="new">Nouvelle</div>'
        + '  </div></div><div id="pol-zone"></div>');
      var self = this;
      $body.find('.omni-choice').on('click', function () {
        $body.find('.omni-choice').removeClass('is-active'); $(this).addClass('is-active');
        self._mode($body, $(this).attr('data-v'));
      });
      var pre = Tokens.get('dt_policy_selected');
      $body.find('.omni-choice[data-v="' + (pre ? 'exist' : 'exist') + '"]').trigger('click');
    },
    _mode: function ($body, m) {
      var $z = $body.find('#pol-zone').empty();
      if (m === 'new') {
        $z.html('<div class="omni-field"><label>Nom de la nouvelle policy</label><input type="text" id="pol-new"></div>');
        $z.find('#pol-new').val(Tokens.get('dt_policy_selected') || '').on('input', function () {
          Tokens.set('dt_policy_selected', $(this).val().trim());
        });
      } else {
        $z.html('<div class="omni-field"><label>Policy existante</label><select id="pol-sel"><option>Chargement…</option></select></div>');
        var $s = $z.find('#pol-sel');
        SearchHub.run('policies', SPL.policies, {
          message: 'Chargement des policies…',
          onResults: function (rows) {
            var h = '<option value="">-- Choisir --</option>';
            rows.forEach(function (r) { if (r[0]) h += '<option>' + r[0] + '</option>'; });
            $s.html(h).val(Tokens.get('dt_policy_selected') || '');
            $s.on('change', function () { Tokens.set('dt_policy_selected', $(this).val()); });
          }
        });
      }
    },
    validate: function () { return true; }
  };

  /* ============================================================
   * ETAPE PERIODE
   * ============================================================ */
  var StepPeriod = {
    id: 'period', label: 'Periode',
    render: function ($body) {
      $body.html('<h2>Periodes de maintenance</h2>'
        + '<p class="omni-hint">Definissez une ou plusieurs periodes. Chaque periode possede son propre status (enabled/disabled).</p>'
        + '<div id="downtime"></div>');
      Periods.init($('#downtime'), Tokens.get('downtime_selected'));
    },
    validate: function () {
      var res = Periods.collect();
      if (res.errors > 0) return res.errorOutput;
      Tokens.set('_collected_periods', JSON.stringify(res.downtimeFields));
      return true;
    }
  };

  /* ============================================================
   * ETAPE VALIDATION
   * ============================================================ */
  var StepReview = {
    id: 'review', label: 'Validation',
    render: function ($body) {
      var rows = [
        ['Service(s)', Tokens.get('service_selected')],
        ['KPI(s)', Tokens.get('kpi_selected')],
        ['Entity(s)', Tokens.get('entity_selected')],
        ['Filtre', Tokens.get('dt_filter_selected')],
        ['Policy', Tokens.get('dt_policy_selected')]
      ].filter(function (r) { return r[1] && r[1] !== 'omni_skip_filter=1'; });
      var tags = function (v) {
        return (v || '').split(';').map(function (x) { return '<span class="omni-tag">' + x + '</span>'; }).join('');
      };
      var html = '<h2>Recapitulatif</h2><table style="width:100%;border-collapse:collapse">';
      rows.forEach(function (r) {
        html += '<tr><td style="padding:8px 0;width:160px;font-weight:600">' + r[0]
          + '</td><td>' + tags(r[1]) + '</td></tr>';
      });
      html += '</table>'
        + '<div class="omni-field"><label>Commentaire / numero de ticket</label>'
        + '<textarea id="commentaire" rows="3"></textarea></div>'
        + '<div class="omni-field"><label><input type="checkbox" id="omni-email-chk"> Envoyer un email recapitulatif</label>'
        + '<input type="text" id="omni-email" placeholder="destinataire@domaine.fr" style="display:none;margin-top:8px"></div>';
      $body.html(html);
      $('#commentaire').val(Tokens.get('commentary_selected') || '').on('input', function () {
        Tokens.set('commentary_selected', $(this).val());
      });
      $('#omni-email-chk').on('change', function () {
        $('#omni-email').toggle(this.checked);
        Tokens.set('sendingEmail', this.checked ? '1' : '');
      });
      var preEmail = Tokens.get('email');
      if (preEmail) $('#omni-email').val(preEmail);
      $('#omni-email').on('input', function () { Tokens.set('email', $(this).val()); });
    },
    validate: function () {
      return (Tokens.get('commentary_selected') || '').trim()
        ? true : 'Le commentaire est obligatoire.';
    }
  };

  /* ============================================================
   * PARCOURS PAR MODE
   * ============================================================ */
  function buildSteps() {
    var service = makeScopeStep({ id: 'service', label: 'Service', title: 'Selection des services',
      hint: 'Choisissez les services concernes.', splFn: function () { return SPL.service; },
      tokenSelected: 'service_selected' });
    var kpi = makeScopeStep({ id: 'kpi', label: 'KPI', title: 'Selection des KPI',
      hint: 'Choisissez les KPI concernes.', splFn: SPL.kpi, tokenSelected: 'kpi_selected' });
    var entity = makeScopeStep({ id: 'entity', label: 'Entity', title: 'Selection des entites',
      hint: 'Choisissez les entites concernees.', splFn: SPL.entity, tokenSelected: 'entity_selected' });

    if (Config.isCustom) {
      return [StepCustomFilter, StepPolicy, StepPeriod, StepReview];
    }
    if (Config.isDelete) {
      return [StepReview];
    }
    return [service, kpi, entity, StepPolicy, StepPeriod, StepReview];
  }

  /* ============================================================
   * WIZARD
   * ============================================================ */
  var Wizard = {
    steps: [], index: 0,

    start: function () {
      this.steps = buildSteps();
      this._renderStepper();
      this.go(0);
      $('#omni-prev').on('click', function () {

console.log("[OmniApp] État des tokens à l'étape précedente :", {
        mode: Config.mode,
        service: Tokens.get('service_selected'),
        kpi: Tokens.get('kpi_selected'),
        entity: Tokens.get('entity_selected'),
        category: Tokens.get('dt_category_selected')

    });
Wizard.go(Wizard.index - 1);
      });
      $('#omni-next').on('click', function () {
console.log("[OmniApp] État des tokens à l'étape suivante :", {
        mode: Config.mode,
        service: Tokens.get('service_selected'),
        kpi: Tokens.get('kpi_selected'),
        entity: Tokens.get('entity_selected'),
        category: Tokens.get('dt_category_selected')
    });
Wizard._next();
       });
      $('#omni-finish').on('click', function () {
console.log("[OmniApp] État des tokens à la derniere étape :", {
        mode: Config.mode,
        service: Tokens.get('service_selected'),
        kpi: Tokens.get('kpi_selected'),
        entity: Tokens.get('entity_selected'),
        category: Tokens.get('dt_category_selected')
    });
 Wizard._finish();
       });
    },

    _renderStepper: function () {
      var html = this.steps.map(function (s, i) {
        return '<li class="omni-step" data-i="' + i + '"><div class="omni-step__dot">'
          + (i + 1) + '</div>' + s.label + '</li>';
      }).join('');
      $('#omni-steps').html(html);
    },

    go: function (i) {
      if (i < 0 || i >= this.steps.length) return;
      this.index = i;
      this.steps[i].render($('#omni-body'));
      $('#omni-steps .omni-step').each(function () {
        var idx = +$(this).attr('data-i');
        $(this).toggleClass('is-active', idx === i).toggleClass('is-done', idx < i);
      });
      $('#omni-prev').prop('disabled', i === 0);
      var last = i === this.steps.length - 1;
      $('#omni-next').toggle(!last);
      $('#omni-finish').toggle(last)
        .removeClass('omni-btn--ok omni-btn--danger')
        .addClass(Config.isDelete ? 'omni-btn--danger' : 'omni-btn--ok')
        .text(Config.isDelete ? 'Confirmer la suppression' : 'Valider');
    },

    _next: function () {
      var v = this.steps[this.index].validate();
      if (v !== true) { UI.modal('Validation incomplete', v, 'err'); return; }
      this.go(this.index + 1);
    },

    _finish: function () {
      var v = this.steps[this.index].validate();
      if (v !== true) { UI.modal('Validation incomplete', v, 'err'); return; }
      Submit.run();
    }
  };

  /* ============================================================
   * SUBMIT
   * ============================================================ */
  var Submit = {
    _stepOpt: function () {
      var pre = Tokens.get('step_opt_for_delete');
      if (Utils.isNotNull(pre)) return pre;
      var s = Tokens.get('service_select_input_type');
      var k = Tokens.get('kpi_select_input_type');
      var e = Tokens.get('entity_select_input_type');
      if (Utils.isNotNull(s) && Utils.isNotNull(k) && Utils.isNotNull(e)) {
        return s.toString() + k.toString() + e.toString();
      }
      return '000';
    },

    // nouveau : type de maintenance au niveau de l'enregistrement KV (itsi | custom)
    _dtCategory: function () {
      var pre = Tokens.get('dt_category_selected');
      if (Utils.isNotNull(pre) && (pre === 'itsi' || pre === 'custom')) return pre;
      return Config.isCustom ? 'custom' : 'itsi';
    },

    _email: function (sel, action) {
      var sending = Tokens.get('sendingEmail');
      var email = Tokens.get('email');
      if (Utils.isNotNull(sending) && Utils.checkEmail(email)) {
        var act = action === 'add' ? 'Ajout' : (action === 'update' ? 'Modification' : 'Suppression');
        return '| table ID,result '
          + '| sendemail to="' + email + '" subject="' + act + ' de downtime" sendresults=true inline=true format=table '
          + 'message="Le downtime ' + sel.ID + ' vient d\'etre ' + (act === 'Ajout' ? 'soumis' : 'mis a jour') + '"';
      }
      return '';
    },

    run: function () {
      $('#omni-finish, #omni-prev').prop('disabled', true);

      var action = Config.isDelete ? 'delete' : (Config.isUpdate ? 'update' : 'add');

      // CORRECTION : SÉCURITÉ - Validation de la clé avant d'appeler le Python
      var currentKey = Tokens.get('key') || '';
      if ((action === 'update' || action === 'delete') && !currentKey) {
          console.error("[OmniApp] Erreur : Clé '_key' absente pour une action de modification/suppression.");
          UI.modal('Erreur critique', "Impossible de valider car l'identifiant unique (key) du KVStore n'a pas été chargé. Vérifiez la définition du lookup.", 'err');
          $('#omni-finish, #omni-prev').prop('disabled', false);
          return;
      }

      // periodes
      var downtimeFields = [];
      if (Config.isDelete) {
        // On lit les periodes existantes (avec leur status individuel) depuis le
        // token. Robustesse : on gere les elements eventuellement re-stringifies,
        // comme dans Periods.init.
        var rawTok = Tokens.get('downtime_selected');
        try {
          var raw = rawTok ? JSON.parse(rawTok) : [];
          var rawArr = Array.isArray(raw) ? raw : [raw];
          downtimeFields = rawArr.map(function (item) {
            if (typeof item === 'string') {
              try { return JSON.parse(item); } catch (e) { return null; }
            }
            return item;
          });
        } catch (e) { downtimeFields = []; }
        downtimeFields = downtimeFields.filter(function (f) { return f && typeof f === 'object'; });
      } else {
        var col = Tokens.get('_collected_periods');
        try { downtimeFields = col ? JSON.parse(col) : Periods.collect().downtimeFields; }
        catch (e) { downtimeFields = Periods.collect().downtimeFields; }
      }

      var version;
      if (action === 'add') version = Tokens.get('selected_version') || 1;
      else if (action === 'update') version = parseInt(Tokens.get('selected_version') || 50, 10) + 2;
      else version = Tokens.get('selected_version') || 99999;

      var sel = {
        mode: Config.mode,
        key: currentKey, // on utilise la clé sécurisée ici
        ID: Config.dtId || Tokens.get('DT_ID') || Utils.createID(),
        username: (window.Splunk && Splunk.util) ? Splunk.util.getConfigValue('USERNAME') : 'unknown',
        commentary: Utils.removeAccents(Tokens.get('commentary_selected') || ''),
        service: Utils.forKV(Tokens.get('service_selected') || '%'),
        kpi: Utils.forKV(Tokens.get('kpi_selected') || '%'),
        entity: Utils.forKV(Tokens.get('entity_selected') || '%'),
        dt_filter: Tokens.get('dt_filter_selected') || (Config.isCustom ? '' : 'omni_skip_filter=1'),
        dt_policy: Tokens.get('dt_policy_selected') || '',
        dt_category: this._dtCategory(),
        step_opt: this._stepOpt(),
        version: version,
        downtimeFields: downtimeFields
      };
      sel.sendEmail = this._email(sel, action);

      log(sel, 'selected -> Submit');

      var query = QueryBuilder.create(sel, action);
      log(query, '=== QUERY FINALE ===');

      console.log("[OmniApp] Envoi de la requête SPL d'enregistrement :", query);
      UI.modal('Enregistrement', 'Enregistrement en cours…', 'info');

      // CORRECTION : Remplacement de SearchHub par SearchManager natif pour capturer l'asynchrone
      var oldSaveSearch = mvc.Components.get('omni_save_search');
      if (oldSaveSearch) {
          oldSaveSearch.destroy();
      }

      var saveSearch = new SearchManager({
          id: 'omni_save_search',
          search: query,
          autostart: true,
          cache: false
      });

      var resultsModel = saveSearch.data("results", { count: 100 });

      resultsModel.on("data", function () {
          if (resultsModel.hasData()) {
              var data = resultsModel.data();
              var fields = data.fields;
              var rows = data.rows;

              console.log("[OmniApp] Champs retournés par le job Splunk :", fields);
              console.log("[OmniApp] Lignes de données reçues (brutes) :", rows);

              var idx = fields.indexOf('result');
              if (idx > -1 && rows.length > 0) {
                  var backendResult = rows[0][idx];

                  console.log("%c[OmniApp] Résultat du KVStore (Backend Python) : " + backendResult, "background: #222; color: #bada55; font-weight: bold; padding: 2px;");

                  // Interception des erreurs de Python
                  if (backendResult.indexOf('ERREUR') === 0 || backendResult.indexOf('Error') === 0 || backendResult.indexOf('Exception') === 0) {
                      console.error("[OmniApp] L'enregistrement a échoué dans le KVStore :", backendResult);
                      UI.modal('Echec (Backend)', 'Le script Python a renvoyé une erreur : <br><br><code style="color: #d9534f; font-weight: bold;">' + backendResult + '</code>', 'err');
                      $('#omni-finish, #omni-prev').prop('disabled', false);
                  } else {
                      // Succès
                      console.log("[OmniApp] Succès : Processus validé et confirmé par le backend.");
                      var msg = action === 'delete'
                        ? 'Suppression effectuée avec succès.'
                        : (Config.isCustom ? 'Filtre personnalisé enregistré avec succès.' : 'Maintenance enregistrée avec succès.');
                      UI.modal('Opération réussie', msg + ' <br><a href="./accueil">Retour au menu</a>', 'ok');
                  }
              } else {
                  console.warn("[OmniApp] Attention : Le champ 'result' est introuvable dans les colonnes retournées.");
              }
          }
      });

      saveSearch.on('search:error', function (err) {
          console.error("[OmniApp] Erreur critique d'exécution Splunk (crash de la recherche) :", err);
          UI.modal('Echec', 'L\'exécution de la commande Splunk a échoué. Vérifiez les droits ou les logs.', 'err');
          $('#omni-finish, #omni-prev').prop('disabled', false);
      });

    }
  };

  /* ============================================================
   * PRECHARGEMENT (update / update_custom / delete)
   * ============================================================ */
  function preloadThenStart() {
    if ((Config.isUpdate || Config.isDelete) && Config.dtId) {
      SearchHub.run('byId', SPL.byId(Config.dtId), {
        message: 'Chargement de la maintenance ' + Config.dtId + '…',
        count: 0,
        onResults: function (rows) {
          if (rows.length) {
            var r = rows[0];
            // index alignes sur le table de SPL.byId :
            // key,downtime,service_type,service,kpi_type,kpi,entity_type,entity,dt_filter,dt_policy,commentary,version,dt_category
            Tokens.set('key', r[0]);
            Tokens.set('downtime_selected', r[1]);
            Tokens.set('service_select_input_type', r[2]);
            Tokens.set('service_selected', r[3]);
            Tokens.set('kpi_select_input_type', r[4]);
            Tokens.set('kpi_selected', r[5]);
            Tokens.set('entity_select_input_type', r[6]);
            Tokens.set('entity_selected', r[7]);
            Tokens.set('dt_filter_selected', r[8]);
            Tokens.set('dt_policy_selected', r[9]);
            Tokens.set('commentary_selected', r[10]);
            Tokens.set('selected_version', r[11]);
            Tokens.set('dt_category_selected', r[12]);
            Tokens.set('step_opt_for_delete', '' + r[2] + r[4] + r[6]);
            if (Config.mode === 'update_custom') StepCustomFilter.preload(r[8]);
          }
          Wizard.start();
        },
        onError: function () { Wizard.start(); }
      });
    } else {
      Wizard.start();
    }
  }

  /* ============================================================
   * BOOT
   * ============================================================ */
  $(document).ready(function () {
    log(Config, 'Config detectee');
    UI.css();
    UI.shell();
    preloadThenStart();
  });

});
