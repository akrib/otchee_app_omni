require([
    'jquery',
    'splunkjs/mvc',
    'splunkjs/mvc/simplexml/ready!'
  ], function ($, mvc, ) {
  var submittedTokens = mvc.Components.get('submitted');
  // Listen for a change to the token tokHTML value
  submittedTokens.on("change:Data2HTML", function (model, Data2HTML, options) {
    var tokHTMLJS = submittedTokens.get("Data2HTML");

    if (tokHTMLJS !== undefined) {
      $("#contentdatahtml").html(tokHTMLJS);
      Pagination();
    }
  });
  function Pagination() {
    if ($("#datahPaginationDiv").length == 0) {
      $('#contentdatahtml').after('<div id="datahPaginationDiv"><center><table><tr><td class="title-pagination">\<</td><td><table id="pagination"></table></td><td class="title-pagination">\></td></tr></table></center></div>');
    } else {
      $('#datahPaginationDiv').html('<center><table><tr><td class="title-pagination">\<</td><td><table id="pagination"></table></td><td class="title-pagination">\></td></tr></table></center>');
    }
    var rowsShown = 30;
    var rowsTotal = $('#contentdatahtml tbody tr').length;
    var numPages = rowsTotal / rowsShown;
    for (i = 0; i < numPages; i++) {
      var pageNum = i + 1;
      $('#pagination').append('<td class="page-oo page-' + i + '-rel"><a href="#" rel="' + i + '">' + pageNum + '</a></td>');
    }
    $('#contentdatahtml tbody tr').hide();
    $('.page-oo').css({
      'color': '#F25C78'
    });
    $('#contentdatahtml tbody tr').slice(0, rowsShown).show();
    $('#pagination a:first').addClass('active');
    $('#pagination a').bind('click', function () {

      $('#pagination a').removeClass('active');
      $('#pagination td').removeClass('active');
      $('.page-oo .active').css({
        'color': '#59324F'
      });
      $(this).addClass('active');
      var currPage = $(this).attr('rel');
      $('.page-' + currPage + '-rel').addClass('active');
      var startItem = currPage * rowsShown;
      var endItem = startItem + rowsShown;
      $('#contentdatahtml tbody tr').css('opacity', '0.0').hide();
      $('#contentdatahtml tbody tr').slice(startItem, endItem).css('display', 'table-row').animate({
        opacity: 1
      }, 300);
    });
  }
});

