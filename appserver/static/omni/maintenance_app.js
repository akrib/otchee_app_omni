/*
 *  Omni Maintenance App  -  appli mono-page (full JS) pour ITSI Maintenance
 *  Remplace : add / add_custom / update / update_custom / delete (5 XML -> 1)
 *  Auteur : refonte structurelle
 *
 *  Principe :
 *   - 1 seule vue XML (cf. itsi__maintenance.xml) avec <div id="omni_maintenance_app">
 *   - le mode vient de l'URL (?mode=...&dt_id=...) -> fallback token -> fallback data-mode
 *   - SearchHub agrege le doneProgress de toutes les recherches => loader global en %
 *   - UI.shell() construit header + stepper + body + footer + modal (CSS injecte, scope)
 *   - Wizard gere navigation + validation par etape
 *   - Une "factory" makeScopeStep() couvre Service / KPI / Entity de facon uniforme
 *
 *  >>> BRANCHEMENT : les zones marquees ainsi sont les points ou tu reconnectes
 *      ta logique existante (omni.js : DataManager / QueryBuilder / UIManager periodes).
 */

var APP_NAME = 'otchee_app_omni';
var APP_VERSION = '2.0.0';

console.log('%c %s', 'background:#222;color:#bada55',
  'Omni Maintenance App v' + APP_VERSION + ' charge');

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
   *  CONFIG  -  detection du mode / dt_id / debug
   * ============================================================ */
  var Config = (function () {
    function urlParam(name) {
      var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(window.location.search);
      return m ? decodeURIComponent(m[1]) : null;
    }
    var $cfg = $('#omni_config');
    var mode = urlParam('mode')
            || (mvc.Components.get('default') && mvc.Components.get('default').get('mode'))
            || $cfg.attr('data-mode')
            || 'add';
    var dtId = urlParam('dt_id')
            || (mvc.Components.get('default') && mvc.Components.get('default').get('DT_ID'))
            || null;
    var debug = (urlParam('debug') || $cfg.attr('data-debug') || '0') === '1';

    return {
      mode: mode,
      dtId: dtId,
      debug: debug,
      isCustom: /custom/.test(mode),
      isUpdate: /update/.test(mode),
      isDelete: mode === 'delete',
      view: utils.getPageInfo().page,
      appPath: APP_NAME
    };
  })();

  /* ============================================================
   *  LOG
   * ============================================================ */
  function log(obj, titre, level) {
    if (!Config.debug) return;
    var colors = ['#fff', '#ff0', '#f00'];
    console.groupCollapsed('%c Omni %s', 'color:' + (colors[level || 0]), titre || '');
    try { console.log(obj); } catch (e) {}
    console.groupEnd();
  }

  /* ============================================================
   *  TOKENS  (compat avec ta logique omni.js existante)
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
   *  SEARCH HUB  -  loader global a pourcentage
   *  Agrege le doneProgress de toutes les recherches actives.
   * ============================================================ */
  var SearchHub = {
    _active: {},   // id -> progress 0..1

    /** Cree une recherche suivie par le loader. opts.onResults(rows) optionnel. */
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
        if (opts.onResults && p.content.resultCount >= 0) {
          var rs = sm.data('results', { count: opts.count || 0, output_mode: 'json' });
          rs.on('data', function () {
            opts.onResults(rs.data().rows || [], rs.data().fields || []);
          });
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
      $ld.find('.omni-loader__bar').css('width', pct + '%');
      $ld.find('.omni-loader__pct').text(pct + '%');
      $ld.find('.omni-loader__msg').text(message || 'Chargement des donnees…');
    }
  };

  /* ============================================================
   *  UI  -  shell + composants
   * ============================================================ */
  var UI = {
    css: function () {
      if ($('#omni-app-style').length) return;
      var c = [
        ':root{--omni-primary:#1977cc;--omni-primary-2:#274685;--omni-accent:#fcb040;--omni-ok:#5cc05c;--omni-err:#d9534f;--omni-line:#e2e8f0;--omni-ink:#1f2933;--omni-muted:#647488;}',
        '#omni_maintenance_app{font-family:Poppins,system-ui,Segoe UI,Roboto,sans-serif;color:var(--omni-ink);max-width:1080px;margin:0 auto;}',
        '.omni-card{background:#fff;border:1px solid var(--omni-line);border-radius:14px;box-shadow:0 6px 24px rgba(20,40,70,.06);overflow:hidden;}',
        '.omni-header{display:flex;align-items:center;gap:16px;padding:18px 24px;background:linear-gradient(90deg,var(--omni-primary),var(--omni-primary-2));color:#fff;}',
        '.omni-header h1{font-size:20px;margin:0;font-weight:600;letter-spacing:.3px;}',
        '.omni-header .omni-badge{margin-left:auto;font-size:12px;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.5px;}',
        '.omni-back{display:inline-flex;align-items:center;gap:6px;color:var(--omni-primary);text-decoration:none;font-weight:600;margin:10px 4px;font-size:14px;}',
        '.omni-back:hover{text-decoration:underline;}',
        /* stepper */
        '.omni-steps{display:flex;padding:22px 24px 6px;gap:0;list-style:none;margin:0;}',
        '.omni-step{flex:1;text-align:center;position:relative;font-size:12.5px;color:var(--omni-muted);}',
        '.omni-step__dot{width:30px;height:30px;line-height:30px;border-radius:50%;background:#fff;border:2px solid var(--omni-line);margin:0 auto 8px;font-weight:600;transition:.25s;}',
        '.omni-step::before,.omni-step::after{content:"";position:absolute;top:15px;height:2px;background:var(--omni-line);width:50%;z-index:0;}',
        '.omni-step::before{left:0;}.omni-step::after{right:0;}',
        '.omni-step:first-child::before,.omni-step:last-child::after{display:none;}',
        '.omni-step__dot{position:relative;z-index:1;}',
        '.omni-step.is-active .omni-step__dot{border-color:var(--omni-primary);background:var(--omni-primary);color:#fff;}',
        '.omni-step.is-active{color:var(--omni-ink);font-weight:600;}',
        '.omni-step.is-done .omni-step__dot{border-color:var(--omni-ok);background:var(--omni-ok);color:#fff;}',
        '.omni-step.is-done::before,.omni-step.is-done::after{background:var(--omni-ok);}',
        /* body */
        '.omni-body{padding:8px 28px 24px;min-height:240px;}',
        '.omni-body h2{font-size:17px;margin:18px 0 4px;}',
        '.omni-body .omni-hint{color:var(--omni-muted);font-size:13px;margin:0 0 16px;}',
        /* footer */
        '.omni-footer{display:flex;gap:12px;padding:16px 28px;border-top:1px solid var(--omni-line);background:#fafbfc;}',
        '.omni-btn{appearance:none;border:1px solid transparent;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer;transition:.15s;font-family:inherit;}',
        '.omni-btn:disabled{opacity:.45;cursor:not-allowed;}',
        '.omni-btn--primary{background:var(--omni-primary);color:#fff;}',
        '.omni-btn--primary:hover:not(:disabled){background:var(--omni-primary-2);}',
        '.omni-btn--ghost{background:#fff;color:var(--omni-muted);border-color:var(--omni-line);}',
        '.omni-btn--danger{background:var(--omni-err);color:#fff;}',
        '.omni-btn--ok{background:var(--omni-ok);color:#fff;}',
        '.omni-spacer{flex:1;}',
        /* champs */
        '.omni-field{margin:14px 0;}',
        '.omni-field label{display:block;font-size:13px;font-weight:600;margin-bottom:6px;}',
        '.omni-field select,.omni-field input[type=text],.omni-field textarea{width:100%;box-sizing:border-box;border:1px solid var(--omni-line);border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;}',
        '.omni-field select:focus,.omni-field input:focus,.omni-field textarea:focus{outline:none;border-color:var(--omni-primary);box-shadow:0 0 0 3px rgba(25,119,204,.12);}',
        '.omni-choices{display:flex;gap:8px;flex-wrap:wrap;}',
        '.omni-choice{border:1px solid var(--omni-line);border-radius:10px;padding:10px 16px;cursor:pointer;font-size:14px;background:#fff;transition:.15s;}',
        '.omni-choice.is-active{border-color:var(--omni-primary);background:rgba(25,119,204,.06);color:var(--omni-primary);font-weight:600;}',
        '.omni-tag{display:inline-block;background:#23579d;color:#fff;border-radius:6px;padding:3px 9px;margin:3px;font-size:13px;}',
        '.omni-pick{height:260px;border:1px solid var(--omni-line);border-radius:10px;width:100%;}',
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
        '.omni-modal__foot{padding:12px 22px;text-align:right;border-top:1px solid var(--omni-line);}'
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
      // le msg du loader est dans .omni-loader__msg-txt -> ajuste le selecteur du hub
      $('#omni-modal-close').on('click', UI.closeModal);
    },

    modal: function (title, body, kind) {
      $('#omni-modal-head').attr('class', 'omni-modal__head' + (kind ? ' is-' + kind : '')).html(title);
      $('#omni-modal-body').html(body);
      $('#omni-modal').addClass('is-open');
    },
    closeModal: function () { $('#omni-modal').removeClass('is-open'); }
  };
  // petite correction : le hub ecrit dans .omni-loader__msg ; on cible le bon span
  SearchHub._render = (function (orig) {
    return function (message) {
      var anyActive = Object.keys(SearchHub._active).length > 0;
      var $ld = $('#omni-loader');
      if (!$ld.length) return;
      if (!anyActive) { $ld.removeClass('is-visible'); return; }
      var pct = Math.round(SearchHub._overall() * 100);
      $ld.addClass('is-visible');
      $ld.find('.omni-loader__bar').css('width', Math.max(pct, 5) + '%');
      $ld.find('.omni-loader__pct').text(pct + '%');
      $ld.find('.omni-loader__msg-txt').text(message || 'Chargement des donnees…');
    };
  })(SearchHub._render);

  /* ============================================================
   *  REQUETES SPL (reprises de tes XML)
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
        + '| table key,downtime,service_type,service,kpi_type,kpi,entity_type,entity,dt_filter,dt_policy,commentary,version';
    }
  };

  /* ============================================================
   *  FACTORY  -  etape de "portee" (Service / KPI / Entity)
   *  Gere les 3 modes de selection : All / List / Wildcard.
   * ============================================================ */
  function makeScopeStep(opts) {
    // opts: { id, label, title, hint, splFn, tokenSelected }
    return {
      id: opts.id,
      label: opts.label,
      render: function ($body) {
        $body.html(''
          + '<h2>' + opts.title + '</h2>'
          + '<p class="omni-hint">' + (opts.hint || '') + '</p>'
          + '<div class="omni-field"><label>Type de selection</label>'
          + '  <div class="omni-choices" id="' + opts.id + '-mode">'
          + '    <div class="omni-choice" data-v="1">Tous</div>'
          + '    <div class="omni-choice" data-v="2">Liste</div>'
          + '    <div class="omni-choice" data-v="3">Wildcard</div>'
          + '  </div></div>'
          + '<div id="' + opts.id + '-zone"></div>');

        var step = this;
        $body.find('.omni-choice').on('click', function () {
          $body.find('.omni-choice').removeClass('is-active');
          $(this).addClass('is-active');
          step._renderMode($body, $(this).attr('data-v'));
        });

        // restaure la selection precedente si presente
        var cur = Tokens.get(opts.id + '_select_input_type');
        $body.find('.omni-choice[data-v="' + (cur || '1') + '"]').trigger('click');
      },

      _renderMode: function ($body, type) {
        Tokens.set(opts.id + '_select_input_type', type);
        var $zone = $body.find('#' + opts.id + '-zone').empty();

        if (type === '1') {                       // ALL
          Tokens.set(opts.tokenSelected, '%');
          $zone.html('<p class="omni-hint">Toutes les valeurs seront prises en compte (<b>%</b>).</p>');
        } else if (type === '3') {                // WILDCARD
          Tokens.unset(opts.tokenSelected);
          $zone.html('<div class="omni-field"><label>Wildcard (ex : *prod*)</label>'
            + '<input type="text" id="' + opts.id + '-wc" placeholder="*prod*"></div>');
          var pre = Tokens.get(opts.tokenSelected) || '';
          $zone.find('#' + opts.id + '-wc').val(pre).on('input', function () {
            var v = $(this).val().trim();
            if (v) Tokens.set(opts.tokenSelected, v); else Tokens.unset(opts.tokenSelected);
          });
        } else {                                  // LIST
          Tokens.unset(opts.tokenSelected);
          $zone.html('<div class="omni-field"><label>' + opts.title
            + '</label><select multiple class="omni-pick" id="' + opts.id + '-list"></select>'
            + '<p class="omni-hint">Maintenez Ctrl/Cmd pour selectionner plusieurs valeurs.</p></div>');
          var $sel = $zone.find('#' + opts.id + '-list');
          SearchHub.run(opts.id + '_list', opts.splFn(), {
            message: 'Chargement des ' + opts.label.toLowerCase() + '…',
            count: 0,
            onResults: function (rows) {
              var html = '<option value="%">-- Tous --</option>';
              rows.forEach(function (r) {
                var v = r[0];
                if (v) html += '<option value="' + v + '">' + v + '</option>';
              });
              $sel.html(html);
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
          ? true
          : 'Veuillez renseigner : ' + opts.label;
      }
    };
  }

  /* ============================================================
   *  ETAPES SPECIFIQUES
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
      $body.find('.omni-choice[data-v="exist"]').trigger('click');
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
            var html = '<option value="">-- Choisir --</option>';
            rows.forEach(function (r) { if (r[0]) html += '<option>' + r[0] + '</option>'; });
            $s.html(html).val(Tokens.get('dt_policy_selected') || '');
            $s.on('change', function () { Tokens.set('dt_policy_selected', $(this).val()); });
          }
        });
      }
    },
    validate: function () { return true; } // policy optionnelle selon ta regle metier
  };

  var StepPeriod = {
    id: 'period', label: 'Periode',
    render: function ($body) {
      $body.html('<h2>Periodes de maintenance</h2>'
        + '<p class="omni-hint">Definissez une ou plusieurs periodes.</p>'
        + '<div id="downtime"></div>');
      // >>> BRANCHEMENT : ici tu reutilises ta logique omni.js des periodes.
      //   ex (selon ton refactor d'omni.js en module reutilisable) :
      //   OmniPeriods.init('#downtime', { mode: Config.mode, dtId: Config.dtId });
      // Pour la demo on signale juste le point d'integration :
      if (window.OmniPeriods && typeof window.OmniPeriods.init === 'function') {
        window.OmniPeriods.init('#downtime', Config);
      } else {
        $('#downtime').html('<p class="omni-hint">[Point d\'integration des periodes — '
          + 'branche ici ta logique UIManager/DataManager d\'omni.js]</p>');
      }
    },
    validate: function () {
      // >>> BRANCHEMENT : retourne la validation reelle des periodes (Validator.allDatepickers)
      return true;
    }
  };

  var StepReview = {
    id: 'review', label: 'Validation',
    render: function ($body) {
      var rows = [
        ['Service(s)', Tokens.get('service_selected')],
        ['KPI(s)', Tokens.get('kpi_selected')],
        ['Entity(s)', Tokens.get('entity_selected')],
        ['Filtre', Tokens.get('dt_filter_selected')],
        ['Policy', Tokens.get('dt_policy_selected')]
      ].filter(function (r) { return r[1]; });
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
      $('#omni-email').on('input', function () { Tokens.set('email', $(this).val()); });
    },
    validate: function () {
      return (Tokens.get('commentary_selected') || '').trim()
        ? true : 'Le commentaire est obligatoire.';
    }
  };

  /* ============================================================
   *  DEFINITION DES PARCOURS PAR MODE
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
      // add_custom / update_custom : Filtre custom -> Policy -> Periode -> Validation
      // >>> BRANCHEMENT : StepCustomFilter a construire (reprend la logique des champs custom)
      return [
        { id: 'filter', label: 'Filtre custom',
          render: function ($b) { $b.html('<h2>Filtre custom</h2><p class="omni-hint">[Branche ici le builder de filtre custom]</p>'); },
          validate: function () { return Tokens.get('dt_filter_selected') ? true : 'Filtre requis'; } },
        StepPolicy, StepPeriod, StepReview
      ];
    }
    if (Config.isDelete) {
      // delete : recap en lecture seule + commentaire obligatoire
      return [StepReview];
    }
    // add / update : parcours complet
    return [service, kpi, entity, StepPolicy, StepPeriod, StepReview];
  }

  /* ============================================================
   *  WIZARD  -  navigation + rendu du stepper
   * ============================================================ */
  var Wizard = {
    steps: [], index: 0,

    start: function () {
      this.steps = buildSteps();
      this._renderStepper();
      this.go(0);
      $('#omni-prev').on('click', function () { Wizard.go(Wizard.index - 1); });
      $('#omni-next').on('click', function () { Wizard._next(); });
      $('#omni-finish').on('click', function () { Wizard._finish(); });
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
      var step = this.steps[i];
      step.render($('#omni-body'));
      // stepper visuel
      $('#omni-steps .omni-step').each(function () {
        var idx = +$(this).attr('data-i');
        $(this).toggleClass('is-active', idx === i).toggleClass('is-done', idx < i);
      });
      // boutons
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
   *  SUBMIT  -  generation requete + execution
   *  >>> BRANCHEMENT : reutilise ton QueryBuilder d'omni.js.
   * ============================================================ */
  var Submit = {
    run: function () {
      $('#omni-finish, #omni-prev').prop('disabled', true);

      // Construit l'objet "selected" attendu par ta logique existante.
      var selected = {
        mode: Config.mode,
        ID: Config.dtId || (Date.now().toString(36)).toUpperCase(),
        service: Tokens.get('service_selected'),
        kpi: Tokens.get('kpi_selected'),
        entity: Tokens.get('entity_selected'),
        dt_filter: Tokens.get('dt_filter_selected') || '',
        dt_policy: Tokens.get('dt_policy_selected') || '',
        commentary: Tokens.get('commentary_selected') || '',
        sendingEmail: Tokens.get('sendingEmail'),
        email: Tokens.get('email')
      };
      log(selected, 'selected -> Submit');

      var action = Config.isDelete ? 'delete' : (Config.isUpdate ? 'update' : 'add');

      // >>> BRANCHEMENT : remplace par ta vraie construction SPL
      //   var query = OmniQueryBuilder.create(selected, action);
      var query = (window.OmniQueryBuilder && window.OmniQueryBuilder.create)
        ? window.OmniQueryBuilder.create(selected, action)
        : null;

      if (!query) {
        UI.modal('Integration requise',
          'Branche <code>OmniQueryBuilder.create()</code> (ta logique omni.js) pour generer la requete d\'enregistrement.',
          'err');
        $('#omni-finish, #omni-prev').prop('disabled', false);
        return;
      }

      SearchHub.run('save', query, {
        message: 'Enregistrement en cours…',
        tokenSafe: true,
        onDone: function () {
          UI.modal('Operation reussie',
            'La maintenance a bien ete enregistree. <br><a href="./accueil">Retour au menu</a>', 'ok');
        },
        onError: function () {
          UI.modal('Echec', 'L\'enregistrement a echoue. Verifiez les logs Splunk.', 'err');
          $('#omni-finish, #omni-prev').prop('disabled', false);
        }
      });
    }
  };

  /* ============================================================
   *  PRECHARGEMENT (modes update/delete) -> remplit les tokens
   * ============================================================ */
  function preloadThenStart() {
    if ((Config.isUpdate || Config.isDelete) && Config.dtId) {
      SearchHub.run('byId', SPL.byId(Config.dtId), {
        message: 'Chargement de la maintenance ' + Config.dtId + '…',
        count: 0,
        onResults: function (rows) {
          if (rows.length) {
            var r = rows[0];
            // index alignes sur le table de SPL.byId
            Tokens.set('key', r[0]);
            Tokens.set('downtime_selected', r[1]);
            Tokens.set('service_selected', r[3]);
            Tokens.set('kpi_selected', r[5]);
            Tokens.set('entity_selected', r[7]);
            Tokens.set('dt_filter_selected', r[8]);
            Tokens.set('dt_policy_selected', r[9]);
            Tokens.set('commentary_selected', r[10]);
            Tokens.set('selected_version', r[11]);
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
   *  BOOT
   * ============================================================ */
  $(document).ready(function () {
    log(Config, 'Config detectee');
    UI.css();
    UI.shell();
    preloadThenStart();
  });

});
