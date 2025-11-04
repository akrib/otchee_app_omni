var APP_NAME = 'otchee_app_omni';
var scriptName = "Step_Wizard_Control";
var scriptVersion = "1.0.2";
console.log(
  "%c %s",
  "background: #222; color: #bada55", 
  "Chargement du script : " + scriptName + " Version: " + scriptVersion + " réussi" 
);
require.config({
  paths: {
    step_control_wizard_view:
      "../app/"+APP_NAME+"/common/assets/js/step_wizard_control/js/views/StepControlWizardView"
  }
});
require([
  "jquery",
  "underscore",
  "splunkjs/mvc",
  "step_control_wizard_view",
  "splunkjs/mvc/simplexml/ready!"
], function($, _, mvc, StepControlWizard) {
  console.log("test");
//   var steps = [
//     {
//       label: "Client",
//       showPreviousButton: true,
//       validateToken: "client_selected"
//     },
//     { label: "site", validateToken: "site_selected" },
//     { label: "target", validateToken: "target_selected"},
//     { label: "servicename", validateToken: "servicename_selected"},
//     { label: "Period", validateToken: "period_selected" },
//     {
//       label: "Validation",
//       showNextButton: false,
//       showDoneButton: true,
//       doneLabel: "Terminé"
//     }
//   ];
//   var formated_steps = [];
//   $.each(steps, function(i, el) {
//     formated_steps.push(genStep(i, el));
//   });
//   console.log("StepControlWizard with formated step");
//   console.log(formated_steps);
//   var step_control = new StepControlWizard({
//     el: "#step_control_wizard_holder"
//   });

//   step_control.set_step(formated_steps);
//   step_control.render();
 
//   function genStep(count, step) {
//     return {
//       label: step.label || "step_" + count.toString(),
//       value: step.value || "step_" + count.toString(),
//       showNextButton:
//         step.showNextButton !== undefined ? step.showNextButton : true,
//       showPreviousButton:
//         step.showPreviousButton !== undefined ? step.showPreviousButton : true,
//       showDoneButton:
//         step.showDoneButton !== undefined ? step.showDoneButton : false,
//       doneLabel: step.doneLabel || "Done",
//       enabled: step.enabled !== undefined ? step.enabled : true,
//       panelID: step.panelID || "#control_step_" + count.toString(),
//       validateToken:
//         step.validateToken !== undefined ? step.validateToken : false
//     };
//   }
// });
var formated_steps = [];
$("[id^=swc_step_").each(function (i, el) {
    formated_steps.push(genStepWithData(i, el));
});

 console.log("StepControlWizard with formated step");
  console.log(formated_steps);
  var step_control = new StepControlWizard({
    el: "#step_control_wizard_holder"
  });
  step_control.set_step(formated_steps);
  step_control.render();

  function genStepWithData(count, step) {
    return {
      label: evalHtmlString($(step).attr('data-label')) || "step_" + count.toString(),
      value: evalHtmlString($(step).attr('data-value')) || "step_" + count.toString(),
      showNextButton:
        evalHtmlString($(step).attr('data-showNextButton')) !== undefined || true,
      showPreviousButton:
      evalHtmlString($(step).attr('data-showPreviousButton')) !== undefined || true,
      showDoneButton:
      evalHtmlString($(step).attr('data-showDoneButton')) !== undefined || false,
      doneLabel: evalHtmlString($(step).attr('data-doneLabel')) || "Done",
      enabled: evalHtmlString($(step).attr('data-enabled')) !== undefined || true,
      panelID: evalHtmlString($(step).attr('data-panelID')) || "#control_step_" + count.toString(),
      validateToken:
      evalHtmlString($(step).attr('data-validateToken')) || undefined
    };
  }
  function evalHtmlString(str){
    if(str=="" || str=="undefined"){
        return undefined
    } 
    if(str=="0" || str=="false" ){
        return false
    }
    if(str=="1" || str=="true"){
        return true
    }
        return str
  }
});
