var APP_NAME = 'otchee_app_omni';
var APP_VERSION = '1.3.0';

console.log('%c %s', 'background:#222;color:#bada55',
  'Omni Maintenance Period Activator v' + APP_VERSION + ' charge');

require([
  'underscore',
  'jquery',
  'splunkjs/mvc',
  'splunkjs/mvc/searchmanager',
  'splunkjs/mvc/utils',
  'splunkjs/mvc/simplexml/ready!'
], function (_, $, mvc, SearchManager, utils) {

  'use strict';

  /* ============================================================
   *  CONFIG
   * ============================================================ */
  var LOOKUP = 'omni_kv_def';
  var MOUNT  = 'omni_maintenance_activator_app';

  function urlParam(name) {
    var safe = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    var m = new RegExp('[?&]' + safe + '=([^&#]*)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  var $cfg = $('#omni_activator_config');
  var Config = {
    debug: (urlParam('debug') || $cfg.attr('data-debug') || '0') === '1',
    // lien depuis les cartes : ?form.DT_ID=...
    dtId: urlParam('form.DT_ID') || urlParam('DT_ID') || urlParam('form.input_ID') || '',
    appPath: APP_NAME,
    // utilisateur Splunk courant (injecte par Splunk Web). Sert a tracer
    // l'auteur du dernier changement dans le champ "creator".
    user: (window.$C && window.$C.USERNAME) || $cfg.attr('data-user') || 'unknown'
  };

  function log(obj, titre, level) {
    if (!Config.debug) return;
    var colors = ['#fff', '#ff0', '#f00'];
    console.groupCollapsed('%c Omni-Act %s', 'color:' + (colors[level || 0]), titre || '');
    try { console.log(obj); } catch (e) {}
    console.groupEnd();
  }

  /* ============================================================
   *  UTIL
   * ============================================================ */
  var Util = {
    esc: function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    },
    enc: function (s) { return encodeURIComponent(s == null ? '' : s); },
    // pour une valeur simple injectee dans une chaine SPL entre guillemets
    splQuote: function (s) { return String(s == null ? '' : s).replace(/"/g, '\\"'); },
    // echappement complet pour embarquer une chaine (ex: du JSON ou un
    // commentaire) dans un litteral SPL double-quote. Aligne sur l'escapeSPL
    // de maintenance_app.js : backslash, guillemet, retours ligne, tab.
    splEscape: function (s) {
      return String(s == null ? '' : s)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');
    },
    arr: function (v) { return (v == null) ? [] : (_.isArray(v) ? v : [v]); },
    // version stockee en ENTIER dans le kvstore : on incremente de 1.
    // vide / non numerique -> 1.
    bumpVersion: function (v) {
      var n = parseInt(String(v == null ? '' : v).trim(), 10);
      return isNaN(n) ? 1 : n + 1;
    },
    // interpretation tolerante d'un status -> true (actif/enabled) / false
    statusOn: function (v) {
      var s = String(v == null ? '' : v).toLowerCase().trim();
      return (s === 'enable' || s === 'enabled' || s === '1'
        || s === 'true' || s === 'on' || s === 'active' || s === 'actif');
    },
    // status d'une periode (porte par l'objet json). Absent -> actif par defaut.
    periodOn: function (p) {
      var s = String(p && p.status != null ? p.status : '').toLowerCase().trim();
      if (s === '') return true;
      return Util.statusOn(s);
    }
  };

  var DT_TYPE_FR = {
    weekly: 'Hebdomadaire', monthly: 'Mensuel', between_date: 'Date a date',
    special_date_first_in_month: 'Premier du mois',
    special_date_second_in_month: 'Deuxieme du mois',
    special_date_third_in_month: 'Troisieme du mois',
    special_date_fourth_in_month: 'Quatrieme du mois',
    special_date_last_in_month: 'Dernier du mois',
    Monday: 'Lundi', Tuesday: 'Mardi', Wednesday: 'Mercredi', Thursday: 'Jeudi',
    Friday: 'Vendredi', Saturday: 'Samedi', Sunday: 'Dimanche'
  };

  /* ============================================================
   *  ETAT
   * ============================================================ */
  var Store = {
    rec: null,         // objet maintenance (champs bruts lus pour le re-write)
    periods: [],       // [{id,dt_type,begin_date,...,status}]
    states: [],        // [true/false] -> status PAR periode (true = enabled)
    global: true,      // status GLOBAL de la regle (champ scalaire hors json)
    busy: false
  };

  /* ============================================================
   *  LOADER  +  RUNNER SEARCH (simplifie)
   * ============================================================ */
  var Loader = {
    show: function (msg, pct) {
      var $l = $('#omni-loader'); if (!$l.length) return;
      $l.addClass('is-visible');
      $l.find('.omni-loader__msg-txt').text(msg || 'Chargement…');
      $l.find('.omni-loader__bar').css('width', Math.max(pct || 5, 5) + '%');
      $l.find('.omni-loader__pct').text((pct || 0) + '%');
    },
    hide: function () { $('#omni-loader').removeClass('is-visible'); }
  };

  function runSearch(spl, opts) {
    opts = opts || {};
    Loader.show(opts.message, 5);
    if (Config.debug) { try { console.log('%c SPL', 'color:#0bf;font-weight:bold', '\n' + spl); } catch (e) {} }

    var sm = new SearchManager({
      id: 'omnia_' + (opts.id || 'q') + '_' + Date.now(),
      preview: false, cache: false, autostart: true,
      search: spl, earliest_time: '0', latest_time: 'now'
    });

    sm.on('search:progress', function (p) {
      var dp = (p && p.content && typeof p.content.doneProgress === 'number') ? p.content.doneProgress : 0;
      Loader.show(opts.message, Math.round(dp * 100));
    });

    sm.on('search:done', function (p) {
      Loader.show(opts.message, 100);
      var rc = (p && p.content) ? p.content.resultCount : -1;
      if (opts.onResults && rc >= 0) {
        var rs = sm.data('results', { count: 0, output_mode: 'json_rows' });
        rs.on('data', function () {
          var d = rs.data() || {};
          var fields = (d.fields || []).map(function (f) { return (typeof f === 'string') ? f : (f && f.name) || f; });
          var rows = d.rows || [];
          Loader.hide();
          opts.onResults(rows, fields);
        });
        rs.on('error', function () { Loader.hide(); if (opts.onError) opts.onError(); });
      } else {
        Loader.hide();
        if (opts.onDone) opts.onDone(p);
      }
    });

    sm.on('search:failed search:error', function (p) {
      log(p, 'recherche en echec', 2);
      Loader.hide();
      if (opts.onError) opts.onError(p);
    });

    return sm;
  }

  function rowObj(row, fields) {
    var o = {}; for (var i = 0; i < fields.length; i++) o[fields[i]] = row[i]; return o;
  }

  function buildReadSpl(id) {
    return ''
      + '| inputlookup ' + LOOKUP + ' '
      + '| search ID="' + Util.splQuote(id) + '" '
      + '| head 1 '
      + '| eval entity=mvjoin(entity,";"), kpi=mvjoin(kpi,";"), service=mvjoin(service,";") '
      // dt_update tolerant pour l'affichage : ancien format = epoch ms,
      // nouveau format = chaine "YYYY/MM/DD HH:MM:SS" ecrite par l'activator.
      + '| eval last_update=if(isnum(dt_update),strftime(round(dt_update/1000,0),"%Y-%m-%d %H:%M:%S"),dt_update) '
      // badge d'affichage
      + '| eval category=if(coalesce(step_opt,"")=="000","CUSTOM","ITSI") '
      // dt_category REEL (champ KV, doit valoir "itsi" ou "custom") :
      // repli sur step_opt si absent/invalide.
      + '| eval dt_category=if(dt_category=="itsi" OR dt_category=="custom",dt_category,'
      + 'if(coalesce(step_opt,"")=="000","custom","itsi")) '
      + '| table _key, ID, creator, last_update, version, category, dt_category, step_opt, '
      + '        dt_policy, dt_filter, commentary, entity, kpi, service, downtime, status';
  }


  function buildSaveSpl(rec, periodsOut, globalOn, creator, version) {
    var globalStatus = globalOn ? 'enabled' : 'disabled';

    // downtime : tableau d'objets -> chaine JSON (la commande la re-eclate en mv)
    var dtJson = JSON.stringify(periodsOut || []);

    // dt_category : doit imperativement valoir "itsi" ou "custom"
    var cat = String(rec.dt_category == null ? '' : rec.dt_category).toLowerCase().trim();
    if (cat !== 'itsi' && cat !== 'custom') {
      cat = (String(rec.step_opt == null ? '' : rec.step_opt) === '000') ? 'custom' : 'itsi';
    }

    // dt_filter : champ obligatoire cote commande (is_null rejette le vide) ->
    // repli sur le marqueur deja utilise par maintenance_app pour les regles ITSI.
    var filter = (rec.dt_filter != null && String(rec.dt_filter).trim() !== '')
      ? rec.dt_filter : 'omni_skip_filter=1';

    // commentary : champ obligatoire cote commande -> repli si vide.
    var commentary = (rec.commentary != null && String(rec.commentary).trim() !== '')
      ? rec.commentary : 'MAJ statut des periodes (activator)';

    // step_opt : conserve tel quel (repli "000" -> CUSTOM)
    var stepOpt = (rec.step_opt != null && String(rec.step_opt).trim() !== '')
      ? rec.step_opt : '000';
    var dtUpdate = new Date().getTime();
    return ''
      + '| makeresults '
      + '| eval '
      +     'key="'         + Util.splEscape(rec._key)            + '", '
      +     'ID="'          + Util.splEscape(rec.ID)              + '", '
      +     'service=split("' + Util.splEscape(rec.service || '%') + '",";"), '
      +     'kpi=split("'     + Util.splEscape(rec.kpi || '%')     + '",";"), '
      +     'entity=split("'  + Util.splEscape(rec.entity || '%')  + '",";"), '
      +     'dt_filter="'   + Util.splEscape(filter)              + '", '
      +     'dt_policy="'    + Util.splEscape(rec.dt_policy || '') + '", '
      +     'dt_category="'  + Util.splEscape(cat)                + '", '
      +     'downtime="'     + Util.splEscape(dtJson)             + '", '
      +     'creator="'      + Util.splEscape(creator)            + '", '
      +     'commentary="'   + Util.splEscape(commentary)         + '", '
      // version : entier (pas de guillemets)
      +     'version='       + version                            + ', '
      // date/heure du changement, format demande : 2026/06/06 23:13:42 (heure serveur)
      +     'dt_update=' + dtUpdate + ', '
      +     'step_opt="'     + Util.splEscape(stepOpt)            + '", '
      // status GLOBAL de la regle (hors json)
      +     'status="'       + globalStatus                       + '" '
      + '| OmniKVUpdate action="update"';
  }

  /* ============================================================
   *  UI  (shell + css)
   * ============================================================ */
  var UI = {
    css: function () {
      if ($('#omni-act-style').length) return;
      var M = '#' + MOUNT;
      var c = [
        ':root{--omni-primary:#23579d;--omni-primary-2:#1d3f73;--omni-accent:#fcb040;--omni-ok:#00cec9;--omni-err:#ff7675;--omni-line:#e2e8f0;--omni-ink:#1f2933;--omni-muted:#647488;}',
        M + '{font-family:Poppins,system-ui,Segoe UI,Roboto,sans-serif;color:var(--omni-ink);max-width:900px;margin:0 auto;}',
        M + ' *{box-sizing:border-box;}',
        '.omni-card{background:#fff;border:1px solid var(--omni-line);border-radius:14px;box-shadow:0 6px 24px rgba(20,40,70,.06);overflow:hidden;}',
        '.omni-header{display:flex;align-items:center;gap:16px;padding:18px 24px;background:linear-gradient(90deg,var(--omni-primary),var(--omni-primary-2));color:#fff;}',
        '.omni-header h1{font-size:19px;margin:0;font-weight:600;letter-spacing:.3px;}',
        '.omni-header .omni-badge{margin-left:auto;font-size:12px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;}',
        '.omni-back{display:inline-flex;align-items:center;gap:6px;color:var(--omni-primary);text-decoration:none;font-weight:600;margin:10px 4px;font-size:14px;}',
        '.omni-back:hover{text-decoration:underline;}',
        '.omni-summary{padding:18px 24px;border-bottom:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-summary .row{margin:4px 0;font-size:13.5px;}',
        '.fieldlist{font-size:12.5px;color:var(--omni-muted);font-weight:600;margin-right:4px;}',
        '.dt-type-badge{font-family:Roboto,sans-serif;font-size:11px;font-weight:700;border-radius:3px;color:#fff;display:inline-block;padding:4px 8px!important;text-transform:uppercase;letter-spacing:.5px;}',
        '.dt-type-itsi{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);}',
        '.dt-type-custom{background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);}',
        '.tag{font-family:Roboto,sans-serif;font-size:12px;background:var(--omni-primary);border-radius:4px;color:#fff;display:inline-block;margin:3px 3px 3px 0!important;padding:3px 8px!important;}',
        '.tag_dt{font-family:Roboto,sans-serif;font-size:11.5px;background:#74b9ff;border-radius:4px;color:#fff;display:inline-block;margin:2px 2px 2px 0!important;padding:2px 7px!important;}',
        '.comment-block{background:#f1f4f8;border-left:3px solid var(--omni-accent);padding:8px 10px;margin:8px 0 0;font-size:12.5px;border-radius:0 6px 6px 0;}',
        /* statut global de la regle (champ hors json) */
        '.omni-master{padding:14px 24px;border-bottom:1px solid var(--omni-line);background:#fff;}',
        '.omni-master:empty{display:none;padding:0;border:0;}',
        '.omni-master__inner{display:flex;align-items:center;gap:14px;border:1px solid var(--omni-line);border-radius:12px;padding:12px 16px;background:linear-gradient(90deg,rgba(35,87,157,.05),#fff);transition:.15s;}',
        '.omni-master__inner.is-off{background:linear-gradient(90deg,rgba(255,118,117,.08),#fff);border-color:rgba(255,118,117,.4);}',
        '.omni-master__txt{flex:1;min-width:0;}',
        '.omni-master__ttl{font-size:14px;font-weight:700;color:var(--omni-primary);}',
        '.omni-master__sub{font-size:12px;color:var(--omni-muted);margin-top:3px;}',
        '.omni-master__sub code{background:#eef2f6;padding:1px 5px;border-radius:4px;}',
        '.omni-master__state{font-size:11px;font-weight:700;letter-spacing:.4px;border-radius:999px;padding:5px 12px;}',
        '.omni-master__state.on{background:rgba(0,206,201,.15);color:#0a8f8b;}',
        '.omni-master__state.off{background:rgba(255,118,117,.15);color:#c0392b;}',
        /* periodes */
        '.omni-periods{padding:16px 24px;}',
        '.omni-periods h3{margin:0 0 6px;font-size:14px;color:var(--omni-primary);}',
        '.omni-bulk{display:flex;gap:10px;margin:6px 0 14px;flex-wrap:wrap;}',
        '.omni-bulk a{font-size:12.5px;color:var(--omni-primary);cursor:pointer;text-decoration:none;font-weight:600;}',
        '.omni-bulk a:hover{text-decoration:underline;}',
        '.omni-period{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid var(--omni-line);border-radius:10px;margin:10px 0;background:#fff;transition:.15s;}',
        '.omni-period.is-off{opacity:.62;background:#fafbfc;}',
        '.omni-period__info{flex:1;min-width:0;}',
        '.omni-period__info .ttl{font-size:13.5px;}',
        '.omni-period__dates{font-size:12px;color:var(--omni-muted);margin-top:4px;}',
        '.omni-period__state{width:104px;text-align:center;font-size:11px;font-weight:700;letter-spacing:.4px;border-radius:999px;padding:5px 0;}',
        '.omni-period__state.on{background:rgba(0,206,201,.15);color:#0a8f8b;}',
        '.omni-period__state.off{background:rgba(255,118,117,.15);color:#c0392b;}',
        /* switch */
        '.omni-switch{position:relative;display:inline-block;width:48px;height:26px;flex:0 0 auto;}',
        '.omni-switch input{display:none;}',
        '.omni-switch .slider{position:absolute;inset:0;background:#cbd5e1;border-radius:999px;transition:.2s;cursor:pointer;}',
        '.omni-switch .slider:before{content:"";position:absolute;width:20px;height:20px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.3);}',
        '.omni-switch input:checked + .slider{background:var(--omni-ok);}',
        '.omni-switch input:checked + .slider:before{transform:translateX(22px);}',
        /* barre d action */
        '.omni-actbar{display:flex;gap:12px;align-items:center;padding:16px 24px;border-top:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-actbar .recap{font-size:13px;color:var(--omni-muted);margin-right:auto;}',
        '.omni-btn{appearance:none;border:1px solid transparent;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;font-family:inherit;}',
        '.omni-btn--primary{background:var(--omni-primary);color:#fff;display:inline-flex;align-items:center;gap:6px;}',
        '.omni-btn--primary:hover{background:var(--omni-primary-2);}',
        '.omni-btn--primary[disabled]{opacity:.5;cursor:not-allowed;}',
        '.omni-btn--ghost{background:#fff;color:var(--omni-muted);border-color:var(--omni-line);}',
        '.omni-btn--ghost:hover{border-color:var(--omni-primary);color:var(--omni-primary);}',
        '.omni-empty{text-align:center;color:var(--omni-muted);padding:48px 12px;font-size:15px;}',
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
        '.omni-modal__head{padding:16px 22px;background:var(--omni-primary);color:#fff;font-weight:600;}',
        '.omni-modal__head.is-err{background:var(--omni-err);}.omni-modal__head.is-ok{background:var(--omni-ok);}',
        '.omni-modal__body{padding:20px 22px;font-size:14px;line-height:1.55;}',
        '.omni-modal__foot{padding:12px 22px;text-align:right;border-top:1px solid var(--omni-line);}'
      ];
      $('<style id="omni-act-style">').text(c.join('\n')).appendTo('head');
    },

    shell: function () {
      var html = ''
        + '<a class="omni-back" href="./itsi__maintenance_search">&#8592; Retour a la recherche</a>'
        + '<div class="omni-card">'
        + '  <div class="omni-header">'
        + '    <img src="/static/app/' + Config.appPath + '/media/logo_omni.png" style="height:30px" onerror="this.style.display=\'none\'"/>'
        + '    <h1>Activation des periodes</h1>'
        + '    <span class="omni-badge">downtime</span>'
        + '  </div>'
        + '  <div id="omni-summary" class="omni-summary"></div>'
        + '  <div id="omni-master" class="omni-master"></div>'
        + '  <div id="omni-periods" class="omni-periods"></div>'
        + '  <div id="omni-actbar" class="omni-actbar" style="display:none">'
        + '    <span class="recap" id="omni-recap"></span>'
        + '    <button class="omni-btn omni-btn--ghost" id="omni-reset">Annuler</button>'
        + '    <button class="omni-btn omni-btn--primary" id="omni-save">&#128190; Enregistrer</button>'
        + '  </div>'
        + '</div>'
        + '<div class="omni-loader" id="omni-loader">'
        + '  <div class="omni-loader__msg"><span class="omni-loader__msg-txt">Chargement…</span><span class="omni-loader__pct">0%</span></div>'
        + '  <div class="omni-loader__track"><div class="omni-loader__bar"></div></div>'
        + '</div>'
        + '<div class="omni-modal" id="omni-modal"><div class="omni-modal__box">'
        + '  <div class="omni-modal__head" id="omni-modal-head">Information</div>'
        + '  <div class="omni-modal__body" id="omni-modal-body"></div>'
        + '  <div class="omni-modal__foot"><button class="omni-btn omni-btn--ghost" id="omni-modal-close">Fermer</button></div>'
        + '</div></div>';

      $('#' + MOUNT).html(html);
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
   *  RENDU
   * ============================================================ */
  var Render = {
    tags: function (val) {
      if (val == null || val === '') return '<span class="fieldlist">-</span>';
      if (val === '*') return '<span class="tag">Tous</span>';
      return String(val).split(';').map(function (x) {
        x = x.trim(); if (!x) return '';
        return '<span class="tag">' + Util.esc(x) + '</span>';
      }).join('');
    },

    summary: function (m) {
      var badge = m.category === 'CUSTOM'
        ? '<span class="dt-type-badge dt-type-custom">CUSTOM</span>'
        : '<span class="dt-type-badge dt-type-itsi">ITSI</span>';
      var html = ''
        + '<div class="row" style="font-size:16px;font-weight:600;color:var(--omni-primary);margin-bottom:8px;">'
        + badge + ' &nbsp;ID [ ' + Util.esc(m.ID) + ' ]'
        + '   <span style="font-size:12px;color:var(--omni-muted);font-weight:400;margin-left:8px;">v' + Util.esc(m.version) + '</span></div>'
        + '<div class="row"><span class="fieldlist">Auteur :</span> ' + Util.esc(m.creator) + ' &nbsp; '
        + '<span class="fieldlist">Derniere MAJ :</span> ' + Util.esc(m.last_update) + '</div>'
        + '<div class="row"><span class="fieldlist">entity :</span> ' + Render.tags(m.entity) + '</div>'
        + '<div class="row"><span class="fieldlist">kpi :</span> ' + Render.tags(m.kpi) + '</div>'
        + '<div class="row"><span class="fieldlist">service :</span> ' + Render.tags(m.service) + '</div>'
        + '<div class="row"><span class="fieldlist">policy(s) :</span> ' + Render.tags(m.dt_policy) + '</div>'
        + (m.dt_filter && m.dt_filter !== 'omni_skip_filter=1'
            ? '<div class="row"><span class="fieldlist">Custom filter(s) :</span> ' + Render.tags(m.dt_filter) + '</div>' : '')
        + (m.commentary ? '<div class="comment-block"><b>Commentaire :</b> ' + Util.esc(m.commentary) + '</div>' : '');
      $('#omni-summary').html(html);
    },

    // interrupteur du status GLOBAL de la regle (champ hors json)
    master: function () {
      var on = Store.global;
      var html = ''
        + '<div class="omni-master__inner ' + (on ? '' : 'is-off') + '">'
        + '  <div class="omni-master__txt">'
        + '    <div class="omni-master__ttl">Statut global de la regle</div>'
        + '    <div class="omni-master__sub">La desactiver coupe la regle entiere, '
        + '        independamment des periodes.</div>'
        + '  </div>'
        + '  <span class="omni-master__state ' + (on ? 'on' : 'off') + '">' + (on ? 'ACTIVE' : 'DESACTIVEE') + '</span>'
        + '  <label class="omni-switch"><input type="checkbox" id="omni-master-tgl" ' + (on ? 'checked' : '') + '/><span class="slider"></span></label>'
        + '</div>';
      $('#omni-master').html(html);
    },

    period: function (p, idx, on) {
      var type  = DT_TYPE_FR[p.dt_type] || p.dt_type || '—';
      var day   = DT_TYPE_FR[p.day] || p.day || '';
      var begin = ((p.begin_date || '') + ' ' + (p.begin_time || '')).trim() || '—';
      var end   = ((p.end_date || '') + ' ' + (p.end_time || '')).trim() || '—';
      return ''
        + '<div class="omni-period ' + (on ? '' : 'is-off') + '" id="omni-period-' + idx + '">'
        + '  <label class="omni-switch"><input type="checkbox" class="omni-tgl" data-i="' + idx + '" ' + (on ? 'checked' : '') + '/><span class="slider"></span></label>'
        + '  <div class="omni-period__info">'
        + '    <div class="ttl"><b>' + Util.esc(p.id || ('Periode ' + (idx + 1))) + '</b> '
        + '         <span class="tag_dt">' + Util.esc(type) + '</span>'
        + (day ? ' <span class="tag_dt">' + Util.esc(day) + '</span>' : '') + '</div>'
        + '    <div class="omni-period__dates"><b>Debut :</b> ' + Util.esc(begin) + ' &nbsp;&nbsp; <b>Fin :</b> ' + Util.esc(end) + '</div>'
        + '  </div>'
        + '  <div class="omni-period__state ' + (on ? 'on' : 'off') + '" data-i="' + idx + '">' + (on ? 'ACTIVE' : 'DESACTIVEE') + '</div>'
        + '</div>';
    },

    periods: function () {
      if (!Store.periods.length) {
        $('#omni-periods').html('<div class="omni-empty" style="padding:24px 12px">'
          + 'Aucune periode definie dans le champ <code>downtime</code>.<br/>'
          + 'Vous pouvez tout de meme activer/desactiver la regle globale ci-dessus.</div>');
        Render.recap();
        return;
      }
      var html = '<h3>Periodes (' + Store.periods.length + ')</h3>'
        + '<div class="omni-bulk">'
        + '  <a id="omni-all-on">Tout activer (regle + periodes)</a>'
        + '  <a id="omni-all-off">Tout desactiver (regle + periodes)</a>'
        + '</div>';
      html += Store.periods.map(function (p, i) { return Render.period(p, i, Store.states[i]); }).join('');
      $('#omni-periods').html(html);
      Render.recap();
    },

    recap: function () {
      var on = Store.states.filter(function (s) { return s; }).length;
      var off = Store.states.length - on;
      var g = Store.global ? 'ACTIVE' : 'DESACTIVEE';
      $('#omni-recap').html('<b>Regle :</b> ' + g
        + (Store.periods.length ? ' &middot; ' + on + ' periode(s) active(s) / ' + off + ' desactivee(s)' : ''));
    },

    refreshRow: function (idx) {
      var on = Store.states[idx];
      var $row = $('#omni-period-' + idx);
      $row.toggleClass('is-off', !on);
      $row.find('.omni-period__state')
        .attr('class', 'omni-period__state ' + (on ? 'on' : 'off'))
        .text(on ? 'ACTIVE' : 'DESACTIVEE');
      Render.recap();
    }
  };

  /* ============================================================
   *  APP
   * ============================================================ */
  var App = {
    init: function () {
      if (!Config.dtId) {
        $('#omni-summary').html('<div class="omni-empty">Aucun identifiant de maintenance (DT_ID) fourni.</div>');
        return;
      }
      App.bind();
      App.load();
    },

    load: function () {
      runSearch(buildReadSpl(Config.dtId), {
        id: 'read',
        message: 'Chargement de la maintenance…',
        onResults: function (rows, fields) {
          if (!rows.length) {
            $('#omni-summary').html('<div class="omni-empty">Maintenance introuvable : ' + Util.esc(Config.dtId) + '</div>');
            $('#omni-master').empty();
            $('#omni-actbar').hide();
            return;
          }
          var m = rowObj(rows[0], fields);
          Store.rec = m;

          // downtime : mv de chaines JSON -> objets (chaque objet porte son status)
          Store.periods = Util.arr(m.downtime).map(function (s) {
            if (s && typeof s === 'object') return s;   // deja un objet (selon version)
            try { return JSON.parse(s); } catch (e) { return {}; }
          });

          // status PAR periode : lu dans chaque objet json (p.status)
          Store.states = Store.periods.map(function (p) { return Util.periodOn(p); });

          // status GLOBAL : champ scalaire hors json. Absent -> actif par defaut.
          var gRaw = _.isArray(m.status) ? m.status[0] : m.status;
          var gs = String(gRaw == null ? '' : gRaw).toLowerCase().trim();
          Store.global = (gs === '') ? true : Util.statusOn(gs);

          log({ periodes: Store.periods.length, states: Store.states, global: Store.global, rec: m }, 'donnees lues');

          Render.summary(m);
          Render.master();
          Render.periods();
          $('#omni-actbar').show();
        },
        onError: function () {
          $('#omni-summary').html('<div class="omni-empty">Erreur de chargement. Verifiez les logs Splunk.</div>');
          $('#omni-master').empty();
          $('#omni-actbar').hide();
        }
      });
    },

    bind: function () {
      // toggles periode (delegation)
      $('#omni-periods').on('change', '.omni-tgl', function () {
        var i = parseInt($(this).attr('data-i'), 10);
        Store.states[i] = this.checked;
        Render.refreshRow(i);
      });

      // bulk : agit sur la regle globale ET sur toutes les periodes
      $('#omni-periods').on('click', '#omni-all-on', function () {
        Store.states = Store.states.map(function () { return true; });
        Store.global = true;
        Render.master();
        Render.periods();
      });
      $('#omni-periods').on('click', '#omni-all-off', function () {
        Store.states = Store.states.map(function () { return false; });
        Store.global = false;
        Render.master();
        Render.periods();
      });

      // interrupteur du status global (independant des periodes)
      $('#omni-master').on('change', '#omni-master-tgl', function () {
        Store.global = this.checked;
        Render.master();
        Render.recap();
      });

      $('#omni-reset').on('click', function () { App.load(); });
      $('#omni-save').on('click', App.save);
    },

    save: function () {
      if (Store.busy || !Store.rec) return;

      // garde-fou : la commande update exige une _key
      if (!Store.rec._key) {
        UI.modal('&#10006; Erreur',
          '<p>Impossible d\'enregistrer : la cle unique (<code>_key</code>) de la maintenance '
          + 'n\'a pas ete chargee. Verifiez la definition du lookup <code>' + LOOKUP + '</code>.</p>', 'err');
        return;
      }

      Store.busy = true;
      $('#omni-save').attr('disabled', 'disabled');

      // on clone chaque periode en y reinjectant son status courant (enabled/disabled)
      var periodsOut = Store.periods.map(function (p, i) {
        var clone = $.extend({}, p);
        clone.status = Store.states[i] ? 'enabled' : 'disabled';
        return clone;
      });

      // version (entier) incrementee + auteur du changement (user Splunk courant)
      var newVersion = Util.bumpVersion(Store.rec.version);
      var creator    = Config.user;

      var spl = buildSaveSpl(Store.rec, periodsOut, Store.global, creator, newVersion);
      log(spl, 'SPL save (OmniKVUpdate)');

      runSearch(spl, {
        id: 'save',
        message: 'Enregistrement…',
        // la commande renvoie une ligne portant un champ "result"
        onResults: function (rows, fields) {
          Store.busy = false;
          $('#omni-save').removeAttr('disabled');

          var idx = (fields || []).indexOf('result');
          var backend = (idx > -1 && rows.length) ? String(rows[0][idx]) : '';
          log({ backend: backend }, 'retour OmniKVUpdate');

          // succes = message "... OK (key: ...)". Tout le reste (ERREUR / Mise a
          // jour interrompue / Exception) est traite comme un echec.
          var ok = /OK\s*\(key/i.test(backend);
          if (!ok) {
            UI.modal('&#10006; Erreur',
              '<p>La mise a jour de la maintenance <b>' + Util.esc(Config.dtId) + '</b> a echoue.</p>'
              + (backend ? '<p><code>' + Util.esc(backend) + '</code></p>' : '')
              + '<p>Verifiez la custom command <code>OmniKVUpdate</code>, vos droits sur le KVStore '
              + 'et les logs Splunk.</p>', 'err');
            return;
          }

          var on = Store.states.filter(function (s) { return s; }).length;
          var off = Store.states.length - on;
          UI.modal('&#10004; Enregistre',
            '<p>Statut mis a jour pour la maintenance <b>' + Util.esc(Config.dtId) + '</b>.</p>'
            + '<p><b>Regle globale :</b> ' + (Store.global ? 'activee' : 'desactivee') + '.</p>'
            + '<p><b>Version :</b> ' + Util.esc(newVersion)
            + ' &nbsp; <b>Modifie par :</b> ' + Util.esc(creator) + '</p>'
            + (Store.periods.length
                ? '<p>' + on + ' periode(s) active(s), ' + off + ' desactivee(s).</p>'
                : ''),
            'ok');
          App.load(); // relit l etat persiste
        },
        // filet de securite : aucune ligne renvoyee (resultCount < 0)
        onDone: function () {
          if (!Store.busy) return; // onResults a deja statue
          Store.busy = false;
          $('#omni-save').removeAttr('disabled');
          UI.modal('&#10006; Erreur',
            '<p>La commande <code>OmniKVUpdate</code> n\'a renvoye aucun resultat. '
            + 'Verifiez les logs Splunk.</p>', 'err');
        },
        onError: function () {
          Store.busy = false;
          $('#omni-save').removeAttr('disabled');
          UI.modal('&#10006; Erreur',
            '<p>L\'execution de la commande a echoue. Verifiez vos droits d\'ecriture sur le KVStore '
            + 'et les logs Splunk.</p>', 'err');
        }
      });
    }
  };

  /* ============================================================
   *  BOOT
   * ============================================================ */
  $(document).ready(function () {
    log(Config, 'Config activator');
    UI.css();
    UI.shell();
    App.init();
  });

});
