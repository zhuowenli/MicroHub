/*
 * @Author: 卓文理
 * @Email: 531840344@qq.com
 * @Date: 2018-06-09 12:01:15
 */

// import 'metro4';
// import clippy from './clippy';
import './microhub.sass';

const $body = $('body');
const $graph = $('.js-contribution-graph');

const COLOR = {
    green: '#00ac00',
    blue: '#00a7d9',
    yellow: '#ffcf00',
    red: '#ff0000',
};

window.clippy.load('Clippy', (agent) => {
    agent.show();
    agent.animate();

    setTimeout(() => {
        agent.speak('Whoops, it looks like you have some merge conflicts!');
    }, 1500);
});

$body.addClass('microhub');

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

window.chrome = chrome;
