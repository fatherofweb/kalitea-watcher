var scopeGlobal = null;

(function ($) {
  var speclistApp = angular.module('speclist', []).config([
    '$interpolateProvider',
    function ($interpolateProvider) {
      $interpolateProvider.startSymbol('{[{').endSymbol('}]}');
    },
  ]);

  speclistApp.factory('transformRequestAsFormPost', function () {
    function transformRequest(data, getHeaders) {
      var headers = getHeaders();
      headers['Content-Type'] =
        'application/x-www-form-urlencoded; charset=utf-8';
      return serializeData(data);
    }
    return transformRequest;

    function serializeData(data) {
      if (!angular.isObject(data)) {
        return data === null ? '' : data.toString();
      }
      var buffer = [];
      for (var name in data) {
        if (!data.hasOwnProperty(name)) {
          continue;
        }
        var value = data[name];
        buffer.push(
          encodeURIComponent(name) +
            '=' +
            encodeURIComponent(value === null ? '' : value)
        );
      }
      var source = buffer.join('&').replace(/%20/g, '+');
      return source;
    }
  });

  speclistApp.controller('mainController', [
    '$scope',
    '$http',
    '$timeout',
    'transformRequestAsFormPost',
    function ($scope, $http, $timeout, transformRequestAsFormPost) {
      scopeGlobal = $scope;

      $scope.component = 'login';
      $scope.component = SLIST.initial || $scope.component;
      $scope.component = localStorage.hasOwnProperty('lmptrackingexec')
        ? 'doubled'
        : $scope.component;
      $scope.loading = false;
      $scope.user = {};
      $scope.dparams = localStorage.hasOwnProperty('lmptrackingexec')
        ? localStorage.getItem('lmptrackingexec').split('-')
        : false;
      $scope.selectedCountryId = '0';
      $scope.selectedLocationId = '0';
      $scope.locations = [];
      $scope.locationIds = [];
      $scope.subscriptions = [];
      $scope.subscriptionIds = [];
      $scope.optoutMode = 'suspend';
      $scope.$watchCollection(
        'locations',
        function (newLocations, oldLocations) {
          $scope.locationIds = _.map(newLocations, function (loc) {
            return loc.id;
          });
        }
      );
      $scope.$watchCollection(
        'subscriptions',
        function (newSubscriptions, oldSubscriptions) {
          $scope.subscriptionIds = _.map(newSubscriptions, function (sub) {
            return sub.id;
          });
        }
      );
      $scope.$watchCollection(
        'component',
        function (newComponent, oldComponent) {
          if (newComponent == 'list') $scope.getSubscriptions();
        }
      );
      $scope.$watch('selectedCountryId', function (newCountryId, oldCountryId) {
        $scope.locationsError = '';
        if (!parseInt(newCountryId)) {
          $scope.locations = [];
          return;
        }
        $scope.loading = true;
        $http
          .get('/async_speclist.php', {
            params: {
              action: 'locations',
              parent: newCountryId,
            },
          })
          .success(function (data, status, headers, config) {
            if (data.ok) {
              $scope.locations = data.locations;
              const destinacijaSelect = $('#dropdownized-1').find('div:first');
              destinacijaSelect.text('-- Izaberite destinaciju --');
            } else {
              $scope.locationsError =
                data.error ||
                'Nepoznata greska prilikom preuzimanja destinacija.';
            }
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          })
          .error(function (data, status, headers, config) {
            $scope.locations = [];
            $scope.locationsError =
              data.error ||
              'Nepoznata greska prilikom preuzimanja destinacija.';
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          });
      });
      $scope.$watch(
        'selectedLocationId',
        function (newLocationId, oldLocationId) {
          var id = parseInt(newLocationId);
          if (id) {
            var idx = $scope.locationIds.indexOf(id);
            if (idx != -1 && $scope.subscriptionIds.indexOf(id) == -1) {
              $scope.add(newLocationId);
            }
            $scope.selectedLocationId = '0';
          }
        }
      );
      $scope.getSubscriptions = function () {
        $scope.locationsError = '';
        $scope.loading = true;
        $http
          .get('/async_speclist.php', {
            params: {
              action: 'subscriptions',
            },
          })
          .success(function (data, status, headers, config) {
            if (data.ok) {
              $scope.subscriptions = data.subscriptions;
              if ($scope.dparams) {
                $scope.add($scope.dparams[0]);
              }
            } else {
              $scope.locationsError =
                data.error ||
                'Nepoznata greska prilikom preuzimanja destinacija.';
            }
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          })
          .error(function (data, status, headers, config) {
            $scope.subscriptions = [];
            $scope.locationsError =
              data.error ||
              'Nepoznata greska prilikom preuzimanja destinacija.';
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          });
      };
      $scope.login = function (user, form) {
        $scope.loginError = '';
        if (form.$valid) {
          var $submitBtn = jQuery(
            'form[name="speclistLoginForm"] [type="submit"]'
          );
          $submitBtn.prop('disabled', true).addClass('btn-loading');

          getRecaptchaToken('saznajte_prvi')
            .then(function (token) {
              $http
                .post(
                  '/async_speclist.php',
                  {
                    action: 'login',
                    email: user.email,
                    'g-recaptcha-response': token,
                  },
                  {
                    transformRequest: transformRequestAsFormPost,
                  }
                )
                .success(function (data, status, headers, config) {
                  $submitBtn.prop('disabled', false).removeClass('btn-loading');
                  if (data.ok) {
                    $scope.subscriptions = data.subscriptions;
                  } else {
                    $scope.loginError =
                      data.error || 'Nepoznata greska prilikom login-a.';
                  }
                  if (data.redirect) $scope.redirect(data.redirect);
                  if (data.user) $scope.user = data.user;
                })
                .error(function (data, status, headers, config) {
                  $submitBtn.prop('disabled', false).removeClass('btn-loading');
                  $scope.loginError =
                    data.error || 'Nepoznata greska prilikom login-a.';
                  if (data.redirect) $scope.redirect(data.redirect);
                  if (data.user) $scope.user = data.user;
                });
            })
            .catch(function (error) {
              console.error('reCAPTCHA error:', error);
              $submitBtn.prop('disabled', false).removeClass('btn-loading');
              $scope.loginError =
                'Greška pri verifikaciji. Molimo osvežite stranicu i pokušajte ponovo.';
            });
        } else {
          $scope.loginError = 'Uneti E-mail nije ispravan.';
        }
      };
      $scope.nodouble = function () {
        $scope.component = 'nodouble';
      };
      $scope.close = function () {
        if (localStorage.hasOwnProperty('lmptrackingexec')) {
          localStorage.removeItem('lmptrackingexec');
          var date = new Date();
          date.setTime(date.getTime() + 25 * 24 * 60 * 60 * 1000);
          var expires = '; expires=' + date.toGMTString();
          document.cookie = 'doubled=1' + expires + '; path=/';
          $http.get('/tracking.php', {
            params: { flush: localStorage.getItem('lmptrackid') },
          });
        }
        $('.header-popup-wrapper')
          .stop(true, true)
          .fadeOut({
            duration: 'fast',
            complete: function () {
              $scope.$apply(function () {
                setTimeout(function () {
                  $scope.redirect('login');
                }, 0);
              });
            },
          });
      };
      $scope.redirect = function (component) {
        $scope.selectedCountryId = '0';
        $scope.selectedLocationId = '0';
        $scope.component = component;
        $scope.user.email = '';
        setTimeout(function () {
          $('#speclistDrzava').trigger('change');
        }, 0);
      };
      $scope.add = function (locationId) {
        $scope.locationsError = '';
        if (!locationId) {
          return;
        }
        $scope.loading = true;
        $http
          .post(
            '/async_speclist.php',
            {
              action: 'add',
              id: locationId,
            },
            {
              transformRequest: transformRequestAsFormPost,
            }
          )
          .success(function (data, status, headers, config) {
            if (data.ok) {
              $scope.subscriptions = data.subscriptions;
            } else {
              $scope.locationsError =
                data.error ||
                'Nepoznata greska prilikom dodavanja destinacije.';
            }
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          })
          .error(function (data, status, headers, config) {
            $scope.locationsError =
              data.error || 'Nepoznata greska prilikom dodavanja destinacije.';
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          });
      };
      $scope.remove = function (locationId) {
        $scope.locationsError = '';
        if (!locationId) {
          return;
        }
        $scope.loading = true;
        $http
          .post(
            '/async_speclist.php',
            {
              action: 'remove',
              id: locationId,
            },
            {
              transformRequest: transformRequestAsFormPost,
            }
          )
          .success(function (data, status, headers, config) {
            if (data.ok) {
              $scope.subscriptions = data.subscriptions;
            } else {
              $scope.locationsError =
                data.error || 'Nepoznata greska prilikom brisanja destinacije.';
            }
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          })
          .error(function (data, status, headers, config) {
            $scope.locationsError =
              data.error || 'Nepoznata greska prilikom brisanja destinacije.';
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
          });
      };
      $scope.doOptout = function (mode) {
        $scope.optoutError = '';
        if (!mode) {
          return;
        }
        $scope.loading = true;
        $http
          .post(
            '/async_speclist.php',
            {
              action: 'optout',
              mode: mode,
            },
            {
              transformRequest: transformRequestAsFormPost,
            }
          )
          .success(function (data, status, headers, config) {
            if (data.ok) {
              $scope.subscriptions = data.subscriptions;
            } else {
              $scope.optoutError =
                data.error || 'Nepoznata greska prilikom odjavljivanja.';
            }
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
            $scope.redirect('optedout');
          })
          .error(function (data, status, headers, config) {
            $scope.optoutError =
              data.error || 'Nepoznata greska prilikom odjavljivanja.';
            if (data.redirect) $scope.redirect(data.redirect);
            if (data.user) $scope.user = data.user;
            $scope.loading = false;
            $scope.redirect('optedout');
          });
      };
    },
  ]);
})(jQuery);
