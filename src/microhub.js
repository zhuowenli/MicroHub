/*
 * @Author: 卓文理
 * @Email: 531840344@qq.com
 * @Date: 2018-06-09 12:01:15
 */

import 'metro4';
import './microhub.sass';

const $body = $('body');

$body.addClass('microhub');

const search = $('.header-search-key-slash');

search.attr('src', chrome.extension.getURL('/assets/search-shortcut-hint.svg'));

window.chrome = chrome;
