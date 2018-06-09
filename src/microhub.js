/*
 * @Author: 卓文理
 * @Email: 531840344@qq.com
 * @Date: 2018-06-09 12:01:15
 */

import './microhub.sass';

const $body = $('body');
const $header = $('.Header');
const $graph = $('.js-contribution-graph');

$body.addClass('microhub');

function insertClippy() {
    window.clippy.load('Clippy', (agent) => {
        agent.show();
        agent.animate();

        setTimeout(() => {
            agent.speak('Whoops, it looks like you have some merge conflicts!');
        }, 1500);
    });
}

function changeContributionGraph() {
    const COLOR = {
        green: '#00ac00',
        blue: '#00a7d9',
        yellow: '#ffcf00',
        red: '#ff0000',
    };

    $graph.find('rect').each((i, el) => {
        const $this = $(el);

        switch ($this.attr('fill')) {
        case '#c6e48b':
            $this.attr('fill', COLOR.green);
            break;
        case '#7bc96f':
            $this.attr('fill', COLOR.blue);
            break;
        case '#239a3b':
            $this.attr('fill', COLOR.yellow);
            break;
        case '#196127':
            $this.attr('fill', COLOR.red);
            break;
        default:
            break;
        }
    });

    $graph.find('ul.legend').html(`
        <li style="background-color: #eee"></li>
        <li style="background-color: ${COLOR.green}"></li>
        <li style="background-color: ${COLOR.blue}"></li>
        <li style="background-color: ${COLOR.yellow}"></li>
        <li style="background-color: ${COLOR.red}"></li>
    `);
}

function insertWordToolbar() {
    let isHide = !!window.localStorage.getItem('MICROHUB:HIDE_WORD_TOOLBAR');
    const $toolbar = $('<div class="word-toolbar"><div class="ctrl"></div></div>');
    $body.addClass('show-word-toolbar');
    $header.append($toolbar);

    if (!isHide) {
        $toolbar.addClass('active');
        $body.addClass('active-word-toolbar');
    }

    $toolbar.delegate('.ctrl', 'click', () => {
        $toolbar.toggleClass('active');
        $body.toggleClass('active-word-toolbar');
        window.localStorage.setItem('MICROHUB:HIDE_WORD_TOOLBAR', isHide ? '' : 1);
        isHide = !isHide;
    });
}

function init() {
    insertClippy();
    changeContributionGraph();
    insertWordToolbar();
}

init();
