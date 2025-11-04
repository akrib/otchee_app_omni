var APP_NAME = 'otchee_app_omni';
    require.config({
      paths: {
        'Toastify': '../app/' + APP_NAME + '/common/assets/js/step_wizard_control/js/lib/toastify',
        'StepWizardControl' : '../app/' + APP_NAME + '/common/assets/js/step_wizard_control/js/views/StepWizardControl',
      },
      shim: {
        'Toastify': {
          deps: ['jquery'],
        },
      },
    });


  define([
  "underscore",
  "backbone",
  "splunkjs/mvc",
  "splunkjs/mvc/utils",
  "jquery",
  "splunkjs/mvc/simplesplunkview",
  "StepWizardControl",
  'css!../app/' + APP_NAME + '/common/assets/js/step_wizard_control/js/lib/toastify.css',
  "Toastify",
], function (_, Backbone, mvc, utils, $, SimpleSplunkView, StepWizardControl) {
  const LOGTITLE = "Step-Wizard-Control";
  var defaultTokenModel = mvc.Components.get("default", {
    create: true,
  });
  var submittedTokenModel = mvc.Components.getInstance("submitted", {
    create: true,
  });
  function isNotNull(variable){
    /* Fonction qui retourne True si la variable n'est pas null */
    return !isNull(variable);
  }

  function isNull(variable){
    /* Fonction qui retourne True si la variable est null */
    if(typeof variable === 'undefined' || variable === null){
      try{
        return (value == '' || value == undefined || value.length == 0);
      }catch(e){
        return true;
      }
    }else{
      return false;
    }
  }

  function Log(obj, titre = "", level = 0) {
    tag = "";
    if (isNotNull(LOGTITLE)) {
      tag += LOGTITLE + " ";
    }
    /* Fonction de Log dans la console javascript */
    var debug = debug || 1;
    var color;
    var tag;
    if (debug == 1) {
      if (level == 0) {
        color = "#FFFFFF";
        tag += "Info";
      } else if (level == 1) {
        color = "#FFFF00";
        tag = "Warn";
      } else if (level == 2) {
        color = "#FF0000";
        tag = "Crit";
      } else {
        color = "#DDDDDD";
        tag = "";
      }
      console.groupCollapsed(
        "%c %s",
        "background: #000000; color: " + color,
        tag + "--" + titre + "--"
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
    }

    console.groupEnd();
  }

  // Define the custom view class
  var StepControlWizardExample = SimpleSplunkView.extend({
    className: "StepControlWizardExample",

    /**
     * Initialize the class.
     *
     * For the steps, we need to instantiate a model with the steps
     */
    initialize: function () {
      // Make the model that will store the steps
      this.steps = new Backbone.Collection();
      this.formated_steps = [
        {
          label: "step_0",
          value: "step_0",
          showDoneButton: true,
          doneLabel: "Terminé",
          panelID: "#control_step_0",
        },
      ];
      this.initial_step = "step_0";
    },

    set_step: function (Arr) {
      this.formated_steps = Arr;
    },
    /**
     * Validate that changing steps is allowed.
     */
    validateStep: function (selectedModel, isSteppingNext) {
      if (selectedModel === undefined || selectedModel === false){
        return true;
      }
      console.log(selectedModel);
      var stepTokenDefault = defaultTokenModel.get(selectedModel);
      var toastTokenDefault = defaultTokenModel.get("toast_message");
      // var toastTokenSubmitted = submittedTokenModel.get("toast_message");
      // Stop if we are on the ingredients step and the checkbox isn't checked
      if (!isSteppingNext) {
        return true;
      }
      console.log(stepTokenDefault);
      if (stepTokenDefault !== undefined) {
        $(window).scrollTop(0);
        return true;
      } else {
        var message = toastTokenDefault || "Les conditions ne sont pas remplies pour passé à l'étape suivante";
        Toastify({
          text: message,
          className: "toast_crit",
          style: {
            // background: "radial-gradient(circle at 10% 50.5%, rgb(255, 107, 6) 0%, rgb(255, 1, 107) 90%)",
            background: "red",
          }
        }).showToast();
        return false;
      }
    },

    /**
     * This is a helper function to create a step.
     */
    createStep: function (step) {
      // Make the model that will store the steps if it doesn't exist yet

      if (this.steps === undefined) {
        this.steps = new Backbone.Collection();
      }
      // This is the instance of your new step
      var newStep = {
        label: _(step.label).t(),
        value: step.value,
        showNextButton:
          step.showNextButton !== undefined ? step.showNextButton : true,
        showPreviousButton:
          step.showPreviousButton !== undefined
            ? step.showPreviousButton
            : true,
        showDoneButton:
          step.showDoneButton !== undefined ? step.showDoneButton : false,
        doneLabel: step.doneLabel || "Done",
        enabled: true,
        panelID: step.panelID,
        validateToken:
          step.validateToken !== undefined ? step.validateToken : undefined,
        validate: function (selectedModel, isSteppingNext) {
          var promise = $.Deferred();

          // Get the response from the validation attempt (if a validateStep function is defined)
          var validation_response = true;

          if (typeof this.validateStep != undefined) {
            validation_response = this.validateStep(
              step.validateToken,
              isSteppingNext
            );
          }

          // Based on the validation action, reject or resolve the promise accordingly to let the UI know if the user should be allowed to go to the next step
          if (validation_response === true) {
            promise.resolve();
          } else if (validation_response === false) {
            promise.reject();
          } else {
            return validation_response; // This is a promise
          }

          return promise;
        }.bind(this),
      };

      return newStep;
    },

    /**
     * Make the steps.
     */
    initializeSteps: function () {
      var c = 0;
      // Make the model that will store the steps
      this.steps = new Backbone.Collection();
      for (const el of this.formated_steps) {
        Log(el,"Step");
        this.steps.add(this.createStep(el), { at: ++c });
      }
    },

    /**
     * Setup the step wizard.
     */
    setupStepWizard: function (initialStep = this.initial_step) {
      var wizard = new Backbone.Model({
        currentStep: initialStep,
      });

      wizard.on(
        "change:currentStep",
        function (model, currentStep) {
          this.steps.map((step) => {
            step.stopListening();
          });

          // Find the associated step model
          var step = this.steps.find(function (step) {
            return step.get("value") == currentStep;
          });

          // Show or hide the next button as necessary
          if (step.get("showNextButton")) {
            $("button.btn-next", this.$el).show();
          } else {
            $("button.btn-next", this.$el).hide();
          }

          // Show or hide the previous button as necessary
          if (step.get("showPreviousButton")) {
            $("button.btn-prev", this.$el).show();
          } else {
            $("button.btn-prev", this.$el).hide();
          }

          // Show or hide the done button as necessary
          if (step.get("showDoneButton")) {
            $("button.btn-finalize", this.$el).show();
            $("button.btn-finalize", this.$el).text(step.get("doneLabel"));
          } else {
            $("button.btn-finalize", this.$el).hide();
          }

          // Hide all of the existing wizard views
          $(".wizard-content", this.$el).hide();

          // Show the next panel
          $(step.get("panelID"), this.$el).show();

          for (const el of this.formated_steps) {
            defaultTokenModel.unset(el["value"]);
            submittedTokenModel.unset(el["value"]);
          }
          defaultTokenModel.set("stepLabel",step.get("label"));
          submittedTokenModel.set("stepLabel",step.get("label"));
          defaultTokenModel.set(step.get("value"), 1);
          submittedTokenModel.set(step.get("value"), 1);
        }.bind(this)
      );

      // This is just the initial hidden step
      this.steps.unshift({
        label: "",
        value: "initial",
        showNextButton: false,
        showPreviousButton: false,
        enabled: false,
      });

      // Create the step wizard control
      this.stepWizard = new StepWizardControl({
        model: wizard,
        modelAttribute: "currentStep",
        collection: this.steps,
      });

      // Render the step wizard
      $("#step-control-wizard", this.$el).append(this.stepWizard.render().el);

      // Hide all of the existing wizard views
      $(".wizard-content", this.$el).hide();

      // Go the initial step: find it first
      var initialStep = this.steps.find(function (step) {
        return step.get("value") == initialStep;
      });

      // ... now show it
      $(initialStep["panelID"], this.$el).show();

      // Go to step one
      this.stepWizard.step(1);
    },

    /**
     * Render the editor.
     */
    render: function () {
      // Apply the template
      this.$el.html('<div id="step-control-wizard"></div>');

      // Initialize the steps model
      this.initializeSteps();

      // Create the step wizard and set the initial step as the "ingredients" step
      this.setupStepWizard();
      console.log(this.formated_steps[0].value);
      defaultTokenModel.set(this.formated_steps[0].value, 1);
      submittedTokenModel.set(this.formated_steps[0].value, 1);

    },
  });

  return StepControlWizardExample;
});
