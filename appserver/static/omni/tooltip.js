require(["jquery", "splunkjs/mvc/simplexml/ready!"], 
 function($) {    
     //Find your input control and associate tool tip attribute for it. Here data-placement represents the position of tool tip(top,bottom,right,left,auto)
     $('#searchbar').find('input').attr('title','Vous pouvez saisir dans ce champs tous critères associés à votre recherche séparés par des espaces (Nom de l hôte, le site, un nom de sonde, un utilisateur, un commentaire, etc ...&#013;Par ex: SRVTEST1 LYON jdupont').attr('data-toggle','tooltip').attr('data-placement','bottom').attr('html', 'true');
     $('#textbox2').find('input').attr('title','Hover on textbox2').attr('data-toggle','tooltip').attr('data-placement','bottom');
     $('#dropdown1').find('button').attr('title','Hover on dropdown1').attr('data-toggle','tooltip').attr('data-placement','bottom');
     $('#multiselect1 > div > div > div').attr('title','Hover on multiselect1').attr('data-toggle','tooltip').attr('data-placement','bottom');
     $('#radio1 > div > div > div').attr('title','Hover on radio1').attr('data-toggle','tooltip').attr('data-placement','bottom');
     $('#time1').find('button').attr('title','Hover on time1').attr('data-toggle','tooltip').attr('data-placement','bottom');
     $('[data-toggle="tooltip"]').tooltip(); 
   }
 );
