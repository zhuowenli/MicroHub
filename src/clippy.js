/*
 * @Author: 卓文理
 * @Email: 531840344@qq.com
 * @Date: 2018-06-09 17:06:47
 */

const clippy = {};

/* eslint-disable no-underscore-dangle, consistent-return, no-mixed-operators, no-restricted-syntax, guard-for-in */

/** ****
 * https://github.com/smore-inc/clippy.js
 *
 * @constructor
 */
clippy.Agent = function (path, data) {
    this.path = path;

    this._queue = new clippy.Queue($.proxy(this._onQueueEmpty, this));

    this._el = $('<div class="clippy"></div>').hide();

    $(document.body).append(this._el);

    this._animator = new clippy.Animator(this._el, path, data);

    this._balloon = new clippy.Balloon(this._el);

    this._setupEvents();
};

clippy.Agent.prototype = {

    /** ************************** API *********************************** */

    /** *
     *
     * @param {Number} x
     * @param {Number} y
     */
    gestureAt (x, y) {
        const d = this._getDirection(x, y);
        const gAnim = `Gesture${d}`;
        const lookAnim = `Look${d}`;

        const animation = this.hasAnimation(gAnim) ? gAnim : lookAnim;
        return this.play(animation);
    },

    /** *
     *
     * @param {Boolean=} fast
     *
     */
    hide (fast, callback) {
        this._hidden = true;
        const el = this._el;
        this.stop();
        if (fast) {
            this._el.hide();
            this.stop();
            this.pause();
            if (callback) callback();
            return;
        }

        return this._playInternal('Hide', function () {
            el.hide();
            this.pause();
            if (callback) callback();
        });
    },


    moveTo (x, y, duration) {
        const dir = this._getDirection(x, y);
        const anim = `Move${dir}`;
        if (duration === undefined) duration = 1000;

        this._addToQueue(function (complete) {
            // the simple case
            if (duration === 0) {
                this._el.css({ top: y, left: x });
                this.reposition();
                complete();
                return;
            }

            // no animations
            if (!this.hasAnimation(anim)) {
                this._el.animate({ top: y, left: x }, duration, complete);
                return;
            }

            const callback = $.proxy(function (name, state) {
                // when exited, complete
                if (state === clippy.Animator.States.EXITED) {
                    complete();
                }
                // if waiting,
                if (state === clippy.Animator.States.WAITING) {
                    this._el.animate({ top: y, left: x }, duration, $.proxy(function () {
                        // after we're done with the movement, do the exit animation
                        this._animator.exitAnimation();
                    }, this));
                }
            }, this);

            this._playInternal(anim, callback);
        }, this);
    },

    _playInternal (animation, callback) {
        // if we're inside an idle animation,
        if (this._isIdleAnimation() && this._idleDfd && this._idleDfd.state() === 'pending') {
            this._idleDfd.done($.proxy(function () {
                this._playInternal(animation, callback);
            }, this));
        }

        this._animator.showAnimation(animation, callback);
    },

    play (animation, timeout, cb) {
        if (!this.hasAnimation(animation)) return false;

        if (timeout === undefined) timeout = 5000;


        this._addToQueue(function (complete) {
            let completed = false;
            // handle callback
            const callback = function (name, state) {
                if (state === clippy.Animator.States.EXITED) {
                    completed = true;
                    if (cb) cb();
                    complete();
                }
            };

            // if has timeout, register a timeout function
            if (timeout) {
                window.setTimeout($.proxy(function () {
                    if (completed) return;
                    // exit after timeout
                    this._animator.exitAnimation();
                }, this), timeout);
            }

            this._playInternal(animation, callback);
        }, this);

        return true;
    },

    /** *
     *
     * @param {Boolean=} fast
     */
    show (fast) {
        this._hidden = false;
        if (fast) {
            this._el.show();
            this.resume();
            this._onQueueEmpty();
            return;
        }

        if (this._el.css('top') === 'auto' || !this._el.css('left') === 'auto') {
            const left = $(window).width() * 0.8;
            const top = ($(window).height() + $(document).scrollTop()) * 0.8;
            this._el.css({ top, left });
        }

        this.resume();
        return this.play('Show');
    },

    /** *
     *
     * @param {String} text
     */
    speak (text, hold) {
        this._addToQueue(function (complete) {
            this._balloon.speak(complete, text, hold);
        }, this);
    },


    /** *
     * Close the current balloon
     */
    closeBalloon () {
        this._balloon.hide();
    },

    delay (time) {
        time = time || 250;

        this._addToQueue(function (complete) {
            this._onQueueEmpty();
            window.setTimeout(complete, time);
        });
    },

    /** *
     * Skips the current animation
     */
    stopCurrent () {
        this._animator.exitAnimation();
        this._balloon.close();
    },


    stop () {
        // clear the queue
        this._queue.clear();
        this._animator.exitAnimation();
        this._balloon.hide();
    },

    /** *
     *
     * @param {String} name
     * @returns {Boolean}
     */
    hasAnimation (name) {
        return this._animator.hasAnimation(name);
    },

    /** *
     * Gets a list of animation names
     *
     * @return {Array.<string>}
     */
    animations () {
        return this._animator.animations();
    },

    /** *
     * Play a random animation
     * @return {jQuery.Deferred}
     */
    animate () {
        const animations = this.animations();
        const anim = animations[Math.floor(Math.random() * animations.length)];
        // skip idle animations
        if (anim.indexOf('Idle') === 0) {
            return this.animate();
        }
        return this.play(anim);
    },

    /** ************************** Utils *********************************** */

    /** *
     *
     * @param {Number} x
     * @param {Number} y
     * @return {String}
     * @private
     */
    _getDirection (x, y) {
        const offset = this._el.offset();
        const h = this._el.height();
        const w = this._el.width();

        const centerX = (offset.left + w / 2);
        const centerY = (offset.top + h / 2);


        const a = centerY - y;
        const b = centerX - x;

        const r = Math.round((180 * Math.atan2(a, b)) / Math.PI);

        // Left and Right are for the character, not the screen :-/
        if (r >= -45 && r < 45) return 'Right';
        if (r >= 45 && r < 135) return 'Up';
        if (r >= 135 && r <= 180 || r >= -180 && r < -135) return 'Left';
        if (r >= -135 && r < -45) return 'Down';

        // sanity check
        return 'Top';
    },

    /** ************************** Queue and Idle handling *********************************** */

    /** *
     * Handle empty queue.
     * We need to transition the animation to an idle state
     * @private
     */
    _onQueueEmpty () {
        if (this._hidden || this._isIdleAnimation()) return;
        const idleAnim = this._getIdleAnimation();
        this._idleDfd = $.Deferred();

        this._animator.showAnimation(idleAnim, $.proxy(this._onIdleComplete, this));
    },

    _onIdleComplete (name, state) {
        if (state === clippy.Animator.States.EXITED) {
            this._idleDfd.resolve();
        }
    },


    /** *
     * Is the current animation is Idle?
     * @return {Boolean}
     * @private
     */
    _isIdleAnimation () {
        const c = this._animator.currentAnimationName;
        return c && c.indexOf('Idle') === 0;
    },


    /**
     * Gets a random Idle animation
     * @return {String}
     * @private
     */
    _getIdleAnimation () {
        const animations = this.animations();
        const r = [];
        for (let i = 0; i < animations.length; i += 1) {
            const a = animations[i];
            if (a.indexOf('Idle') === 0) {
                r.push(a);
            }
        }

        // pick one
        const idx = Math.floor(Math.random() * r.length);
        return r[idx];
    },

    /** ************************** Events *********************************** */

    _setupEvents () {
        $(window).on('resize', $.proxy(this.reposition, this));

        this._el.on('mousedown', $.proxy(this._onMouseDown, this));

        this._el.on('dblclick', $.proxy(this._onDoubleClick, this));
    },

    _onDoubleClick () {
        if (!this.play('ClickedOn')) {
            this.animate();
        }
    },

    reposition () {
        if (!this._el.is(':visible')) return;
        const o = this._el.offset();
        const bH = this._el.outerHeight();
        const bW = this._el.outerWidth();

        const wW = $(window).width();
        const wH = $(window).height();
        const sT = $(window).scrollTop();
        const sL = $(window).scrollLeft();

        let top = o.top - sT;
        let left = o.left - sL;
        const m = 5;
        if (top - m < 0) {
            top = m;
        } else if ((top + bH + m) > wH) {
            top = wH - bH - m;
        }

        if (left - m < 0) {
            left = m;
        } else if (left + bW + m > wW) {
            left = wW - bW - m;
        }

        this._el.css({ left, top });
        // reposition balloon
        this._balloon.reposition();
    },

    _onMouseDown (e) {
        e.preventDefault();
        this._startDrag(e);
    },


    /** ************************** Drag *********************************** */

    _startDrag (e) {
        // pause animations
        this.pause();
        this._balloon.hide(true);
        this._offset = this._calculateClickOffset(e);

        this._moveHandle = $.proxy(this._dragMove, this);
        this._upHandle = $.proxy(this._finishDrag, this);

        $(window).on('mousemove', this._moveHandle);
        $(window).on('mouseup', this._upHandle);

        this._dragUpdateLoop = window.setTimeout($.proxy(this._updateLocation, this), 10);
    },

    _calculateClickOffset (e) {
        const mouseX = e.pageX;
        const mouseY = e.pageY;
        const o = this._el.offset();
        return {
            top: mouseY - o.top,
            left: mouseX - o.left
        };
    },

    _updateLocation () {
        this._el.css({ top: this._targetY, left: this._taregtX });
        this._dragUpdateLoop = window.setTimeout($.proxy(this._updateLocation, this), 10);
    },

    _dragMove (e) {
        e.preventDefault();
        const x = e.clientX - this._offset.left;
        const y = e.clientY - this._offset.top;
        this._taregtX = x;
        this._targetY = y;
    },

    _finishDrag () {
        window.clearTimeout(this._dragUpdateLoop);
        // remove handles
        $(window).off('mousemove', this._moveHandle);
        $(window).off('mouseup', this._upHandle);
        // resume animations
        this._balloon.show();
        this.reposition();
        this.resume();
    },

    _addToQueue (func, scope) {
        if (scope) func = $.proxy(func, scope);
        this._queue.queue(func);
    },

    /** ************************** Pause and Resume *********************************** */

    pause () {
        this._animator.pause();
        this._balloon.pause();
    },

    resume () {
        this._animator.resume();
        this._balloon.resume();
    }

};

/** ****
 *
 *
 * @constructor
 */
clippy.Animator = function (el, path, data) {
    this._el = el;
    this._data = data;
    this._path = path;
    this._currentFrameIndex = 0;
    this._currentFrame = undefined;
    this._exiting = false;
    this._currentAnimation = undefined;
    this._endCallback = undefined;
    this._started = false;
    this._sounds = {};
    this.currentAnimationName = undefined;
    this._overlays = [this._el];
    let curr = this._el;

    this._setupElement(this._el);
    for (let i = 1; i < this._data.overlayCount; i += 1) {
        const inner = this._setupElement($('<div></div>'));

        curr.append(inner);
        this._overlays.push(inner);
        curr = inner;
    }
};

clippy.Animator.prototype = {
    _setupElement (el) {
        const frameSize = this._data.framesize;
        el.css('display', 'none');
        el.css({ width: frameSize[0], height: frameSize[1] });
        el.css('background', `url('${this._path}/map.png') no-repeat`);

        return el;
    },

    animations () {
        const r = [];
        const d = this._data.animations;

        for (const n in d) {
            r.push(n);
        }

        return r;
    },

    preloadSounds (sounds) {
        for (let i = 0; i < this._data.sounds.length; i += 1) {
            const snd = this._data.sounds[i];
            const uri = sounds[snd];
            if (uri) {
                this._sounds[snd] = new Audio(uri);
            }
        }
    },
    hasAnimation (name) {
        return !!this._data.animations[name];
    },

    exitAnimation () {
        this._exiting = true;
    },


    showAnimation (animationName, stateChangeCallback) {
        this._exiting = false;

        if (!this.hasAnimation(animationName)) {
            return false;
        }

        this._currentAnimation = this._data.animations[animationName];
        this.currentAnimationName = animationName;


        if (!this._started) {
            this._step();
            this._started = true;
        }

        this._currentFrameIndex = 0;
        this._currentFrame = undefined;
        this._endCallback = stateChangeCallback;

        return true;
    },


    _draw () {
        let images = [];
        if (this._currentFrame) images = this._currentFrame.images || [];

        for (let i = 0; i < this._overlays.length; i += 1) {
            if (i < images.length) {
                const xy = images[i];
                const bg = `${-xy[0]}px ${-xy[1]}px`;
                this._overlays[i].css({ 'background-position': bg, display: 'block' });
            } else {
                this._overlays[i].css('display', 'none');
            }
        }
    },

    _getNextAnimationFrame () {
        if (!this._currentAnimation) return undefined;
        // No current frame. start animation.
        if (!this._currentFrame) return 0;
        const currentFrame = this._currentFrame;
        const branching = this._currentFrame.branching;


        if (this._exiting && currentFrame.exitBranch !== undefined) {
            return currentFrame.exitBranch;
        } else if (branching) {
            let rnd = Math.random() * 100;
            for (let i = 0; i < branching.branches.length; i += 1) {
                const branch = branching.branches[i];
                if (rnd <= branch.weight) {
                    return branch.frameIndex;
                }

                rnd -= branch.weight;
            }
        }

        return this._currentFrameIndex + 1;
    },

    _playSound () {
        const s = this._currentFrame.sound;
        if (!s) return;
        const audio = this._sounds[s];
        if (audio) audio.play();
    },

    _atLastFrame () {
        return this._currentFrameIndex >= this._currentAnimation.frames.length - 1;
    },

    _step () {
        if (!this._currentAnimation) return;
        const newFrameIndex = Math.min(this._getNextAnimationFrame(), this._currentAnimation.frames.length - 1);
        const frameChanged = !this._currentFrame || this._currentFrameIndex !== newFrameIndex;
        this._currentFrameIndex = newFrameIndex;

        // always switch frame data, unless we're at the last frame of an animation with a useExitBranching flag.
        if (!(this._atLastFrame() && this._currentAnimation.useExitBranching)) {
            this._currentFrame = this._currentAnimation.frames[this._currentFrameIndex];
        }

        this._draw();
        this._playSound();

        this._loop = window.setTimeout($.proxy(this._step, this), this._currentFrame.duration);


        // fire events if the frames changed and we reached an end
        if (this._endCallback && frameChanged && this._atLastFrame()) {
            if (this._currentAnimation.useExitBranching && !this._exiting) {
                this._endCallback(this.currentAnimationName, clippy.Animator.States.WAITING);
            } else {
                this._endCallback(this.currentAnimationName, clippy.Animator.States.EXITED);
            }
        }
    },

    /** *
     * Pause animation execution
     */
    pause () {
        window.clearTimeout(this._loop);
    },

    /** *
     * Resume animation
     */
    resume () {
        this._step();
    }
};

clippy.Animator.States = { WAITING: 1, EXITED: 0 };

/** ****
 *
 *
 * @constructor
 */
clippy.Balloon = function (targetEl) {
    this._targetEl = targetEl;

    this._hidden = true;
    this._setup();
};

clippy.Balloon.prototype = {

    WORD_SPEAK_TIME: 320,
    CLOSE_BALLOON_DELAY: 2000,

    _setup () {
        this._balloon = $('<div class="clippy-balloon"><div class="clippy-tip"></div><div class="clippy-content"></div></div> ').hide();
        this._content = this._balloon.find('.clippy-content');

        $(document.body).append(this._balloon);
    },

    reposition () {
        const sides = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

        for (let i = 0; i < sides.length; i += 1) {
            const s = sides[i];
            this._position(s);
            if (!this._isOut()) break;
        }
    },

    _BALLOON_MARGIN: 15,

    /** *
     *
     * @param side
     * @private
     */
    _position (side) {
        const o = this._targetEl.offset();
        const h = this._targetEl.height();
        const w = this._targetEl.width();

        const bH = this._balloon.outerHeight();
        const bW = this._balloon.outerWidth();

        this._balloon.removeClass('clippy-top-left');
        this._balloon.removeClass('clippy-top-right');
        this._balloon.removeClass('clippy-bottom-right');
        this._balloon.removeClass('clippy-bottom-left');

        let left;
        let top;

        switch (side) {
        case 'top-left':
            // right side of the balloon next to the right side of the agent
            left = o.left + w - bW;
            top = o.top - bH - this._BALLOON_MARGIN;
            break;
        case 'top-right':
            // left side of the balloon next to the left side of the agent
            left = o.left;
            top = o.top - bH - this._BALLOON_MARGIN;
            break;
        case 'bottom-right':
            // right side of the balloon next to the right side of the agent
            left = o.left;
            top = o.top + h + this._BALLOON_MARGIN;
            break;
        case 'bottom-left':
            // left side of the balloon next to the left side of the agent
            left = o.left + w - bW;
            top = o.top + h + this._BALLOON_MARGIN;
            break;
        default:
        }

        this._balloon.css({ top, left });
        this._balloon.addClass(`clippy-${side}`);
    },

    _isOut () {
        const o = this._balloon.offset();
        const bH = this._balloon.outerHeight();
        const bW = this._balloon.outerWidth();

        const wW = $(window).width();
        const wH = $(window).height();
        const sT = $(document).scrollTop();
        const sL = $(document).scrollLeft();

        const top = o.top - sT;
        const left = o.left - sL;
        const m = 5;
        if (top - m < 0 || left - m < 0) return true;
        if ((top + bH + m) > wH || (left + bW + m) > wW) return true;

        return false;
    },

    speak (complete, text, hold) {
        this._hidden = false;
        this.show();
        const c = this._content;
        // set height to auto
        c.height('auto');
        c.width('auto');
        // add the text
        c.text(text);
        // set height
        c.height(c.height());
        c.width(c.width());
        c.text('');
        this.reposition();

        this._complete = complete;
        this._sayWords(text, hold, complete);
    },

    show () {
        if (this._hidden) return;
        this._balloon.show();
    },

    hide (fast) {
        if (fast) {
            this._balloon.hide();
            return;
        }

        this._hiding = window.setTimeout($.proxy(this._finishHideBalloon, this), this.CLOSE_BALLOON_DELAY);
    },

    _finishHideBalloon () {
        if (this._active) return;
        this._balloon.hide();
        this._hidden = true;
        this._hiding = null;
    },

    _sayWords (text, hold, complete) {
        this._active = true;
        this._hold = hold;
        const words = text.split(/[^\S-]/);
        const time = this.WORD_SPEAK_TIME;
        const el = this._content;
        let idx = 1;


        this._addWord = $.proxy(function () {
            if (!this._active) return;
            if (idx > words.length) {
                this._active = false;
                if (!this._hold) {
                    complete();
                    this.hide();
                }
            } else {
                el.text(words.slice(0, idx).join(' '));
                idx += 1;
                this._loop = window.setTimeout($.proxy(this._addWord, this), time);
            }
        }, this);

        this._addWord();
    },

    close () {
        if (this._active) {
            this._hold = false;
        } else if (this._hold) {
            this._complete();
        }
    },

    pause () {
        window.clearTimeout(this._loop);
        if (this._hiding) {
            window.clearTimeout(this._hiding);
            this._hiding = null;
        }
    },

    resume () {
        if (this._addWord) this._addWord();
        this._hiding = window.setTimeout($.proxy(this._finishHideBalloon, this), this.CLOSE_BALLOON_DELAY);
    }


};


clippy.BASE_PATH = '//s3.amazonaws.com/clippy.js/Agents/';

clippy.load = function (name, successCb, failCb) {
    const path = clippy.BASE_PATH + name;

    const mapDfd = clippy.load._loadMap(path);
    let agent;

    clippy.ready('Clippy', {
        overlayCount: 1,
        sounds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
        framesize: [124, 93],
        animations: {
            Congratulate: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 10,
                    images: [
                        [124, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [248, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [372, 0]
                    ],
                    sound: '14'
                }, {
                    duration: 10,
                    images: [
                        [496, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [620, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [744, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [868, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [992, 0]
                    ],
                    sound: '1'
                }, {
                    duration: 100,
                    images: [
                        [1116, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 0]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [1488, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 0]
                    ],
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [1736, 0]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [1488, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 0]
                    ],
                    exitBranch: 21
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            LookRight: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [620, 651]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [744, 651]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [868, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            SendMail: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [1240, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 1302]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [496, 1302]
                    ],
                    exitBranch: 24
                }, {
                    duration: 100,
                    images: [
                        [620, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1302]
                    ],
                    exitBranch: 26
                }, {
                    duration: 100,
                    images: [
                        [868, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1302]
                    ],
                    exitBranch: 27
                }, {
                    duration: 100,
                    images: [
                        [1116, 1302]
                    ],
                    exitBranch: 28
                }, {
                    duration: 100,
                    images: [
                        [1240, 1302]
                    ],
                    exitBranch: 29
                }, {
                    duration: 100,
                    images: [
                        [1364, 1302]
                    ],
                    exitBranch: 30
                }, {
                    duration: 100,
                    images: [
                        [1488, 1302]
                    ],
                    exitBranch: 31
                }, {
                    duration: 100,
                    images: [
                        [1612, 1302]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [1736, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1302]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 1395]
                    ],
                    exitBranch: 48
                }, {
                    duration: 100,
                    images: [
                        [372, 1395]
                    ],
                    exitBranch: 49
                }, {
                    duration: 100,
                    images: [
                        [496, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1395]
                    ],
                    sound: '4'
                }, {
                    duration: 100,
                    images: [
                        [744, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1395]
                    ]
                }, {
                    duration: 600
                }, {
                    duration: 100,
                    images: [
                        [992, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Thinking: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [124, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 93]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [620, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 93]
                    ],
                    sound: '4'
                }, {
                    duration: 100,
                    images: [
                        [1860, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 186]
                    ],
                    exitBranch: 33,
                    branching: {
                        branches: [{
                            frameIndex: 21,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [744, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 93]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [620, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Explain: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 186]
                    ]
                }, {
                    duration: 900,
                    images: [
                        [1364, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            IdleRopePile: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [1612, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [1860, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [2108, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [2356, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [2604, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [2852, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [3100, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 186]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [0, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [248, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [496, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [744, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [992, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [1240, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [1488, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [1736, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [1984, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [2232, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 279]
                    ],
                    exitBranch: 74
                }, {
                    duration: 100,
                    images: [
                        [2604, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 279]
                    ],
                    exitBranch: 40
                }, {
                    duration: 100,
                    images: [
                        [2852, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 279]
                    ],
                    exitBranch: 42
                }, {
                    duration: 100,
                    images: [
                        [3100, 279]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 279]
                    ],
                    exitBranch: 44
                }, {
                    duration: 100,
                    images: [
                        [0, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 372]
                    ],
                    exitBranch: 46
                }, {
                    duration: 100,
                    images: [
                        [248, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 372]
                    ],
                    exitBranch: 48
                }, {
                    duration: 100,
                    images: [
                        [496, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 372]
                    ],
                    exitBranch: 50
                }, {
                    duration: 100,
                    images: [
                        [744, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 372]
                    ],
                    exitBranch: 52
                }, {
                    duration: 100,
                    images: [
                        [992, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 372]
                    ],
                    exitBranch: 54
                }, {
                    duration: 100,
                    images: [
                        [1240, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 372]
                    ],
                    exitBranch: 56
                }, {
                    duration: 100,
                    images: [
                        [1488, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 372]
                    ],
                    exitBranch: 58
                }, {
                    duration: 100,
                    images: [
                        [1736, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 372]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [1984, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 372]
                    ],
                    exitBranch: 70
                }, {
                    duration: 100,
                    images: [
                        [2232, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 61,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2356, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 61,
                            weight: 25
                        }, {
                            frameIndex: 67,
                            weight: 25
                        }, {
                            frameIndex: 65,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2480, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 63,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 61,
                            weight: 25
                        }, {
                            frameIndex: 67,
                            weight: 25
                        }, {
                            frameIndex: 63,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2728, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 65,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 61,
                            weight: 25
                        }, {
                            frameIndex: 65,
                            weight: 25
                        }, {
                            frameIndex: 63,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2852, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 67,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 65,
                            weight: 25
                        }, {
                            frameIndex: 67,
                            weight: 25
                        }, {
                            frameIndex: 63,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2976, 372]
                    ],
                    exitBranch: 70,
                    branching: {
                        branches: [{
                            frameIndex: 61,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [3100, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 372]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            IdleAtom: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 44,
                            weight: 97
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [124, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 186]
                    ],
                    exitBranch: 33,
                    branching: {
                        branches: [{
                            frameIndex: 21,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [744, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Print: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [248, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 465]
                    ],
                    sound: '5'
                }, {
                    duration: 100,
                    images: [
                        [744, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 465]
                    ],
                    sound: '8'
                }, {
                    duration: 150,
                    images: [
                        [1488, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 465]
                    ],
                    sound: '8'
                }, {
                    duration: 100,
                    images: [
                        [1736, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 465]
                    ]
                }, {
                    duration: 450,
                    images: [
                        [2852, 465]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2976, 465]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 465]
                    ],
                    exitBranch: 26
                }, {
                    duration: 100,
                    images: [
                        [3224, 465]
                    ],
                    sound: '7'
                }, {
                    duration: 100,
                    images: [
                        [0, 558]
                    ],
                    exitBranch: 28
                }, {
                    duration: 100,
                    images: [
                        [124, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 558]
                    ],
                    exitBranch: 30
                }, {
                    duration: 100,
                    images: [
                        [372, 558]
                    ]
                }, {
                    duration: 600,
                    images: [
                        [496, 558]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [620, 558]
                    ],
                    sound: '7'
                }, {
                    duration: 100,
                    images: [
                        [744, 558]
                    ],
                    exitBranch: 34
                }, {
                    duration: 100,
                    images: [
                        [868, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 558]
                    ],
                    exitBranch: 36
                }, {
                    duration: 100,
                    images: [
                        [1116, 558]
                    ]
                }, {
                    duration: 600,
                    images: [
                        [1240, 558]
                    ],
                    exitBranch: 38
                }, {
                    duration: 100,
                    images: [
                        [1364, 558]
                    ],
                    sound: '7'
                }, {
                    duration: 100,
                    images: [
                        [1488, 558]
                    ],
                    exitBranch: 40
                }, {
                    duration: 100,
                    images: [
                        [1612, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 558]
                    ],
                    exitBranch: 44
                }, {
                    duration: 600,
                    images: [
                        [1860, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 558]
                    ],
                    exitBranch: 44,
                    sound: '7'
                }, {
                    duration: 100,
                    images: [
                        [2108, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 558]
                    ],
                    exitBranch: 46
                }, {
                    duration: 100,
                    images: [
                        [2356, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 558]
                    ],
                    exitBranch: 48
                }, {
                    duration: 100,
                    images: [
                        [2604, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 558]
                    ],
                    exitBranch: 51
                }, {
                    duration: 600,
                    images: [
                        [2852, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 558]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 558]
                    ],
                    exitBranch: 53
                }, {
                    duration: 100,
                    images: [
                        [3224, 558]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [0, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 651]
                    ],
                    exitBranch: 58
                }, {
                    duration: 100,
                    images: [
                        [496, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Hide: {
                frames: [{
                    duration: 10,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [2480, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [2604, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [2728, 0]
                    ]
                }, {
                    duration: 10
                }]
            },
            GetAttention: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [1240, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 651]
                    ],
                    sound: '10'
                }, {
                    duration: 150,
                    images: [
                        [2356, 651]
                    ]
                }, {
                    duration: 150,
                    images: [
                        [2232, 651]
                    ],
                    sound: '10'
                }, {
                    duration: 150,
                    images: [
                        [2356, 651]
                    ]
                }, {
                    duration: 150,
                    images: [
                        [2232, 651]
                    ],
                    sound: '10'
                }, {
                    duration: 150,
                    images: [
                        [2480, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 651]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 744]
                    ],
                    exitBranch: 23
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Save: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [3100, 837]
                    ]
                }, {
                    duration: 130,
                    images: [
                        [3224, 837]
                    ],
                    sound: '13'
                }, {
                    duration: 130,
                    images: [
                        [0, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 930]
                    ],
                    exitBranch: 10
                }, {
                    duration: 450,
                    images: [
                        [620, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 930]
                    ],
                    exitBranch: 10
                }, {
                    duration: 100,
                    images: [
                        [744, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 930]
                    ]
                }, {
                    duration: 130,
                    images: [
                        [1116, 930]
                    ],
                    sound: '8'
                }, {
                    duration: 130,
                    images: [
                        [1240, 930]
                    ]
                }, {
                    duration: 130,
                    images: [
                        [1364, 930]
                    ]
                }, {
                    duration: 130,
                    images: [
                        [1488, 930]
                    ],
                    sound: '8'
                }, {
                    duration: 130,
                    images: [
                        [1612, 930]
                    ],
                    sound: '8'
                }, {
                    duration: 130,
                    images: [
                        [1736, 930]
                    ]
                }, {
                    duration: 130,
                    images: [
                        [1860, 930]
                    ],
                    sound: '8'
                }, {
                    duration: 100,
                    images: [
                        [1984, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 930]
                    ],
                    sound: '9'
                }, {
                    duration: 160,
                    images: [
                        [2232, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 930]
                    ],
                    sound: '2'
                }, {
                    duration: 100,
                    images: [
                        [2480, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 930]
                    ],
                    exitBranch: 34
                }, {
                    duration: 450,
                    images: [
                        [2852, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 930]
                    ],
                    exitBranch: 34,
                    sound: '10'
                }, {
                    duration: 400,
                    images: [
                        [3100, 930]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 930]
                    ],
                    exitBranch: 34
                }, {
                    duration: 100,
                    images: [
                        [0, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GetTechy: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [124, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 93]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [620, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 93]
                    ],
                    sound: '4'
                }, {
                    duration: 100,
                    images: [
                        [1860, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 186]
                    ],
                    exitBranch: 33,
                    branching: {
                        branches: [{
                            frameIndex: 21,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [744, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 93]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [620, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GestureUp: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 744]
                    ],
                    exitBranch: 11
                }, {
                    duration: 100,
                    images: [
                        [1488, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 744]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 5,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1736, 744]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [1860, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Idle1_1: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 37,
                            weight: 20
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2108, 744]
                    ],
                    exitBranch: 2,
                    branching: {
                        branches: [{
                            frameIndex: 1,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2232, 744]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [2356, 744]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2480, 744]
                    ],
                    exitBranch: 5,
                    branching: {
                        branches: [{
                            frameIndex: 4,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 744]
                    ],
                    exitBranch: 16,
                    branching: {
                        branches: [{
                            frameIndex: 9,
                            weight: 25
                        }, {
                            frameIndex: 12,
                            weight: 25
                        }, {
                            frameIndex: 15,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2728, 744]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2852, 744]
                    ],
                    exitBranch: 8,
                    branching: {
                        branches: [{
                            frameIndex: 7,
                            weight: 94
                        }, {
                            frameIndex: 5,
                            weight: 3
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2976, 744]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [3100, 744]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [3224, 744]
                    ],
                    exitBranch: 11,
                    branching: {
                        branches: [{
                            frameIndex: 10,
                            weight: 94
                        }, {
                            frameIndex: 8,
                            weight: 2
                        }, {
                            frameIndex: 5,
                            weight: 2
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [0, 837]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [124, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [248, 837]
                    ],
                    exitBranch: 14,
                    branching: {
                        branches: [{
                            frameIndex: 13,
                            weight: 93
                        }, {
                            frameIndex: 11,
                            weight: 3
                        }, {
                            frameIndex: 5,
                            weight: 2
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [372, 837]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [496, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [620, 837]
                    ],
                    exitBranch: 17,
                    branching: {
                        branches: [{
                            frameIndex: 16,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [744, 837]
                    ],
                    exitBranch: 36,
                    branching: {
                        branches: [{
                            frameIndex: 36,
                            weight: 90
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [868, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [992, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [1116, 837]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 300,
                    images: [
                        [1364, 837]
                    ],
                    exitBranch: 23,
                    branching: {
                        branches: [{
                            frameIndex: 22,
                            weight: 94
                        }, {
                            frameIndex: 23,
                            weight: 3
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1488, 837]
                    ],
                    exitBranch: 35,
                    branching: {
                        branches: [{
                            frameIndex: 24,
                            weight: 25
                        }, {
                            frameIndex: 27,
                            weight: 25
                        }, {
                            frameIndex: 30,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1612, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [1736, 837]
                    ],
                    exitBranch: 26,
                    branching: {
                        branches: [{
                            frameIndex: 25,
                            weight: 94
                        }, {
                            frameIndex: 23,
                            weight: 3
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1860, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [1984, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2108, 837]
                    ],
                    exitBranch: 29,
                    branching: {
                        branches: [{
                            frameIndex: 28,
                            weight: 94
                        }, {
                            frameIndex: 23,
                            weight: 3
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2232, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [2356, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2480, 837]
                    ],
                    exitBranch: 32,
                    branching: {
                        branches: [{
                            frameIndex: 31,
                            weight: 94
                        }, {
                            frameIndex: 23,
                            weight: 3
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [2728, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2852, 837]
                    ],
                    exitBranch: 35,
                    branching: {
                        branches: [{
                            frameIndex: 34,
                            weight: 80
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2976, 837]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 42
                }, {
                    duration: 100,
                    images: [
                        [1116, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 186]
                    ]
                }, {
                    duration: 900,
                    images: [
                        [1364, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Processing: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [1240, 1023]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [1364, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 1023]
                    ],
                    exitBranch: 33
                }, {
                    duration: 100,
                    images: [
                        [1736, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1023]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [2232, 1023]
                    ],
                    exitBranch: 31
                }, {
                    duration: 100,
                    images: [
                        [2356, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1023]
                    ],
                    exitBranch: 31
                }, {
                    duration: 100,
                    images: [
                        [2852, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1023]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1116]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [124, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1116]
                    ],
                    exitBranch: 28,
                    branching: {
                        branches: [{
                            frameIndex: 7,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1240, 1116]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [1364, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Alert: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [2356, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1116]
                    ],
                    sound: '6'
                }, {
                    duration: 100,
                    images: [
                        [3100, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1209]
                    ]
                }, {
                    duration: 500,
                    images: [
                        [124, 1209]
                    ],
                    exitBranch: 13
                }, {
                    duration: 100,
                    images: [
                        [248, 1209]
                    ],
                    exitBranch: 13
                }, {
                    duration: 100,
                    images: [
                        [372, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            LookUpRight: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [248, 744]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [372, 744]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [496, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 744]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            IdleSideToSide: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 744]
                    ],
                    exitBranch: 2,
                    branching: {
                        branches: [{
                            frameIndex: 1,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2232, 744]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [2356, 744]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2480, 744]
                    ],
                    exitBranch: 5,
                    branching: {
                        branches: [{
                            frameIndex: 4,
                            weight: 95
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 744]
                    ],
                    exitBranch: 16,
                    branching: {
                        branches: [{
                            frameIndex: 9,
                            weight: 25
                        }, {
                            frameIndex: 12,
                            weight: 25
                        }, {
                            frameIndex: 15,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2728, 744]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2852, 744]
                    ],
                    exitBranch: 8,
                    branching: {
                        branches: [{
                            frameIndex: 7,
                            weight: 92
                        }, {
                            frameIndex: 5,
                            weight: 5
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2976, 744]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [3100, 744]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [3224, 744]
                    ],
                    exitBranch: 11,
                    branching: {
                        branches: [{
                            frameIndex: 10,
                            weight: 91
                        }, {
                            frameIndex: 8,
                            weight: 5
                        }, {
                            frameIndex: 5,
                            weight: 2
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [0, 837]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [124, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [248, 837]
                    ],
                    exitBranch: 14,
                    branching: {
                        branches: [{
                            frameIndex: 13,
                            weight: 91
                        }, {
                            frameIndex: 11,
                            weight: 3
                        }, {
                            frameIndex: 5,
                            weight: 2
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [372, 837]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [496, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [620, 837]
                    ],
                    exitBranch: 17,
                    branching: {
                        branches: [{
                            frameIndex: 16,
                            weight: 75
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [744, 837]
                    ],
                    exitBranch: 36,
                    branching: {
                        branches: [{
                            frameIndex: 36,
                            weight: 90
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [868, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [992, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [1116, 837]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 300,
                    images: [
                        [1364, 837]
                    ],
                    exitBranch: 23,
                    branching: {
                        branches: [{
                            frameIndex: 22,
                            weight: 91
                        }, {
                            frameIndex: 23,
                            weight: 5
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1488, 837]
                    ],
                    exitBranch: 35,
                    branching: {
                        branches: [{
                            frameIndex: 24,
                            weight: 25
                        }, {
                            frameIndex: 27,
                            weight: 25
                        }, {
                            frameIndex: 30,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1612, 837]
                    ]
                }, {
                    duration: 0,
                    images: [
                        [1736, 837]
                    ],
                    exitBranch: 26,
                    branching: {
                        branches: [{
                            frameIndex: 25,
                            weight: 91
                        }, {
                            frameIndex: 23,
                            weight: 5
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1860, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [1984, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2108, 837]
                    ],
                    exitBranch: 29,
                    branching: {
                        branches: [{
                            frameIndex: 28,
                            weight: 91
                        }, {
                            frameIndex: 23,
                            weight: 5
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2232, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [2356, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2480, 837]
                    ],
                    exitBranch: 32,
                    branching: {
                        branches: [{
                            frameIndex: 31,
                            weight: 91
                        }, {
                            frameIndex: 23,
                            weight: 5
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 837]
                    ],
                    exitBranch: 35
                }, {
                    duration: 100,
                    images: [
                        [2728, 837]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2852, 837]
                    ],
                    exitBranch: 35,
                    branching: {
                        branches: [{
                            frameIndex: 34,
                            weight: 80
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2976, 837]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GoodBye: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 34,
                    sound: '15',
                    branching: {
                        branches: [{
                            frameIndex: 34,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2356, 2883]
                    ]
                }, {
                    duration: 250,
                    images: [
                        [2480, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 2883]
                    ],
                    sound: '13'
                }, {
                    duration: 100,
                    images: [
                        [2728, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 2883]
                    ],
                    sound: '12'
                }, {
                    duration: 100,
                    images: [
                        [3224, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2976]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [620, 2976]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [744, 2976]
                    ],
                    sound: '10'
                }, {
                    duration: 200,
                    images: [
                        [620, 2976]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [868, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2976]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [1240, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 2976]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [1488, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 2976]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [2604, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2976]
                    ],
                    exitBranch: 37,
                    branching: {
                        branches: [{
                            frameIndex: 37,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1240, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1395]
                    ]
                }, {
                    duration: 100
                }]
            },
            LookLeft: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [248, 1488]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [372, 1488]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [496, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            IdleHeadScratch: {
                frames: [{
                    duration: 100,
                    images: [
                        [1984, 2418]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 18,
                            weight: 85
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2108, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2418]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [2356, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 2418]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [2852, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 2418]
                    ],
                    exitBranch: 16,
                    branching: {
                        branches: [{
                            frameIndex: 6,
                            weight: 80
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [3224, 2418]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [0, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2511]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [248, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2511]
                    ],
                    exitBranch: 16,
                    branching: {
                        branches: [{
                            frameIndex: 12,
                            weight: 80
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [620, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2511]
                    ]
                }]
            },
            LookUpLeft: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [868, 1488]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [992, 1488]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [1116, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            CheckingSomething: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [1488, 1488]
                    ],
                    sound: '13'
                }, {
                    duration: 100,
                    images: [
                        [1612, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1488]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2356, 1488]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2480, 1488]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2604, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1488]
                    ],
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [2852, 1488]
                    ],
                    exitBranch: 52
                }, {
                    duration: 140,
                    images: [
                        [2976, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1581]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [124, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 1581]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [620, 1581]
                    ],
                    exitBranch: 22,
                    branching: {
                        branches: [{
                            frameIndex: 21,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [744, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1581]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [992, 1581]
                    ],
                    exitBranch: 25,
                    branching: {
                        branches: [{
                            frameIndex: 24,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1116, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1581]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [1488, 1581]
                    ],
                    exitBranch: 29,
                    branching: {
                        branches: [{
                            frameIndex: 28,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1612, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1581]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [1860, 1581]
                    ],
                    exitBranch: 32,
                    branching: {
                        branches: [{
                            frameIndex: 31,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1984, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 1581]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2480, 1581]
                    ],
                    exitBranch: 37,
                    branching: {
                        branches: [{
                            frameIndex: 36,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2604, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1581]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2852, 1581]
                    ],
                    exitBranch: 40,
                    branching: {
                        branches: [{
                            frameIndex: 39,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2976, 1581]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1581]
                    ],
                    exitBranch: 50
                }, {
                    duration: 100,
                    images: [
                        [3224, 1581]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 14,
                            weight: 75
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [0, 1674]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [124, 1674]
                    ],
                    exitBranch: 51,
                    branching: {
                        branches: [{
                            frameIndex: 44,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [248, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1674]
                    ],
                    exitBranch: 49,
                    branching: {
                        branches: [{
                            frameIndex: 48,
                            weight: 85
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [744, 1674]
                    ],
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [868, 1674]
                    ],
                    exitBranch: 52,
                    branching: {
                        branches: [{
                            frameIndex: 10,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [992, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1674]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [1240, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Hearing_1: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [2356, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1116]
                    ],
                    sound: '6'
                }, {
                    duration: 100,
                    images: [
                        [3100, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1209]
                    ]
                }, {
                    duration: 500,
                    images: [
                        [124, 1209]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [1364, 1674]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 6,
                            weight: 60
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2976, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1116]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [3224, 1116]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1209]
                    ],
                    exitBranch: 32
                }, {
                    duration: 500,
                    images: [
                        [1364, 1674]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 12,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1488, 1674]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [1612, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1674]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [1860, 1674]
                    ]
                }, {
                    duration: 400,
                    images: [
                        [1984, 1674]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [2108, 1674]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 18,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2232, 1674]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [2356, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1674]
                    ],
                    exitBranch: 32
                }, {
                    duration: 500,
                    images: [
                        [2604, 1674]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [2728, 1674]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 17,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2852, 1674]
                    ],
                    exitBranch: 32
                }, {
                    duration: 100,
                    images: [
                        [2976, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 1209]
                    ],
                    exitBranch: 32,
                    branching: {
                        branches: [{
                            frameIndex: 12,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [372, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1209]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GetWizardy: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 10,
                    images: [
                        [124, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [248, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [372, 0]
                    ],
                    sound: '14'
                }, {
                    duration: 10,
                    images: [
                        [496, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [620, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [744, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [868, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [992, 0]
                    ],
                    sound: '1'
                }, {
                    duration: 100,
                    images: [
                        [1116, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 0]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [1488, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 0]
                    ],
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [1736, 0]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [1488, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 0]
                    ],
                    exitBranch: 21
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            IdleFingerTap: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 2976]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 2976]
                    ],
                    exitBranch: 8
                }, {
                    duration: 100,
                    images: [
                        [0, 3069]
                    ],
                    exitBranch: 8
                }, {
                    duration: 100,
                    images: [
                        [124, 3069]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 7,
                            weight: 3
                        }]
                    }
                }, {
                    duration: 150,
                    images: [
                        [248, 3069]
                    ],
                    exitBranch: 7,
                    branching: {
                        branches: [{
                            frameIndex: 6,
                            weight: 98
                        }, {
                            frameIndex: 5,
                            weight: 2
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [372, 3069]
                    ],
                    exitBranch: 8
                }, {
                    duration: 100,
                    images: [
                        [496, 3069]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 3069]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GestureLeft: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 1767]
                    ],
                    exitBranch: 12
                }, {
                    duration: 100,
                    images: [
                        [248, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 1767]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 4,
                            weight: 60
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [496, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1767]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [744, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1767]
                    ]
                }, {
                    duration: 450,
                    images: [
                        [992, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1674]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Wave: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15',
                    branching: {
                        branches: [{
                            frameIndex: 15,
                            weight: 33
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1116, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1767]
                    ],
                    exitBranch: 13
                }, {
                    duration: 100,
                    images: [
                        [1488, 1767]
                    ],
                    exitBranch: 13
                }, {
                    duration: 100,
                    images: [
                        [1612, 1767]
                    ],
                    exitBranch: 13
                }, {
                    duration: 100,
                    images: [
                        [1736, 1767]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 9,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1860, 1767]
                    ],
                    exitBranch: 11,
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [1984, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1767]
                    ],
                    exitBranch: 11,
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [2232, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 1767]
                    ],
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [2480, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1767]
                    ],
                    exitBranch: 26,
                    branching: {
                        branches: [{
                            frameIndex: 26,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2852, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1767]
                    ],
                    sound: '12'
                }, {
                    duration: 100,
                    images: [
                        [3224, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 1860]
                    ],
                    exitBranch: 24,
                    sound: '10'
                }, {
                    duration: 1200,
                    images: [
                        [248, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 1860]
                    ],
                    exitBranch: 24,
                    sound: '10'
                }, {
                    duration: 1300,
                    images: [
                        [248, 1860]
                    ]
                }, {
                    duration: 50,
                    images: [
                        [496, 1860]
                    ]
                }, {
                    duration: 50,
                    images: [
                        [2976, 1767]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GestureRight: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1860]
                    ],
                    exitBranch: 11
                }, {
                    duration: 100,
                    images: [
                        [1240, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1860]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 5,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1488, 1860]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [1612, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1860]
                    ]
                }, {
                    duration: 550,
                    images: [
                        [1116, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Writing: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [1860, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1860]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [2852, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1860]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 1860]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 26,
                            weight: 45
                        }, {
                            frameIndex: 32,
                            weight: 25
                        }, {
                            frameIndex: 42,
                            weight: 15
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [0, 1953]
                    ],
                    exitBranch: 55
                }, {
                    duration: 100,
                    images: [
                        [124, 1953]
                    ],
                    exitBranch: 55
                }, {
                    duration: 100,
                    images: [
                        [248, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [372, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [496, 1953]
                    ],
                    exitBranch: 55
                }, {
                    duration: 200,
                    images: [
                        [620, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [744, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [868, 1953]
                    ],
                    exitBranch: 55
                }, {
                    duration: 200,
                    images: [
                        [992, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [1116, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [1240, 1953]
                    ],
                    exitBranch: 55
                }, {
                    duration: 200,
                    images: [
                        [1364, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [1488, 1953]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 32,
                            weight: 20
                        }, {
                            frameIndex: 42,
                            weight: 15
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1612, 1953]
                    ],
                    exitBranch: 56
                }, {
                    duration: 100,
                    images: [
                        [1736, 1953]
                    ]
                }, {
                    duration: 400,
                    images: [
                        [1860, 1953]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 28,
                            weight: 80
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1984, 1953]
                    ],
                    exitBranch: 30
                }, {
                    duration: 400,
                    images: [
                        [2108, 1953]
                    ],
                    exitBranch: 55,
                    branching: {
                        branches: [{
                            frameIndex: 30,
                            weight: 75
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2232, 1953]
                    ],
                    exitBranch: 55,
                    branching: {
                        branches: [{
                            frameIndex: 13,
                            weight: 25
                        }, {
                            frameIndex: 42,
                            weight: 20
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2356, 1953]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2604, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2728, 1953]
                    ],
                    exitBranch: 54
                }, {
                    duration: 200,
                    images: [
                        [2852, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2976, 1953]
                    ],
                    exitBranch: 54
                }, {
                    duration: 100,
                    images: [
                        [3100, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [3224, 1953]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [0, 2046]
                    ],
                    exitBranch: 55
                }, {
                    duration: 200,
                    images: [
                        [124, 2046]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 13,
                            weight: 25
                        }, {
                            frameIndex: 26,
                            weight: 25
                        }, {
                            frameIndex: 32,
                            weight: 25
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [248, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2046]
                    ],
                    exitBranch: 55
                }, {
                    duration: 100,
                    images: [
                        [496, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 2046]
                    ],
                    exitBranch: 57
                }, {
                    duration: 100,
                    images: [
                        [1612, 2046]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 26,
                            weight: 33
                        }, {
                            frameIndex: 32,
                            weight: 33
                        }, {
                            frameIndex: 13,
                            weight: 34
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1736, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 2046]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [2108, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }]
            },
            IdleSnooze: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 2046]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 2046]
                    ]
                }, {
                    duration: 400,
                    images: [
                        [0, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2139]
                    ],
                    exitBranch: 20
                }, {
                    duration: 100,
                    images: [
                        [1240, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 2139]
                    ],
                    exitBranch: 23
                }, {
                    duration: 100,
                    images: [
                        [1612, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 2139]
                    ],
                    exitBranch: 26
                }, {
                    duration: 100,
                    images: [
                        [1984, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 2139]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2139]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [2356, 2139]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2480, 2139]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [2604, 2139]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [2728, 2139]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [2852, 2139]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [2976, 2139]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [3100, 2139]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [3224, 2139]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [0, 2232]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [124, 2232]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [248, 2232]
                    ],
                    exitBranch: 83,
                    branching: {
                        branches: [{
                            frameIndex: 27,
                            weight: 90
                        }, {
                            frameIndex: 46,
                            weight: 5
                        }, {
                            frameIndex: 52,
                            weight: 5
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [372, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [620, 2232]
                    ]
                }, {
                    duration: 1200,
                    images: [
                        [744, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [1116, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [1364, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [1488, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 400,
                    images: [
                        [1612, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [1860, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [2108, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [2356, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [2480, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 600,
                    images: [
                        [2604, 2232]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2728, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 300,
                    images: [
                        [2852, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 300,
                    images: [
                        [2976, 2232]
                    ],
                    exitBranch: 60
                }, {
                    duration: 100,
                    images: [
                        [3100, 2232]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 2232]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [0, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [248, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [372, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [496, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [744, 2325]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [868, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [992, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [1116, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [1240, 2325]
                    ]
                }, {
                    duration: 200,
                    images: [
                        [1364, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 200,
                    images: [
                        [1488, 2325]
                    ],
                    exitBranch: 75,
                    branching: {
                        branches: [{
                            frameIndex: 69,
                            weight: 20
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1612, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [1736, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [1860, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [1984, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 2325]
                    ],
                    exitBranch: 83
                }, {
                    duration: 100,
                    images: [
                        [2232, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 2325]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [2480, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2325]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            LookDownRight: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [3100, 2325]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [3224, 2325]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [0, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GetArtsy: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 2418]
                    ]
                }, {
                    duration: 400,
                    images: [
                        [1612, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 2418]
                    ],
                    sound: '10'
                }, {
                    duration: 100,
                    images: [
                        [1612, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 2418]
                    ],
                    sound: '10'
                }, {
                    duration: 2400,
                    images: [
                        [1612, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2418]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2418]
                    ],
                    exitBranch: 22
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Show: {
                frames: [{
                    duration: 10
                }, {
                    duration: 10,
                    images: [
                        [2728, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [2604, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [2480, 0]
                    ]
                }, {
                    duration: 10,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            LookDown: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [2852, 0]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [2976, 0]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [3100, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 93]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Searching: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [992, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 2511]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [1612, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 2511]
                    ]
                }, {
                    duration: 800,
                    images: [
                        [3224, 2511]
                    ],
                    exitBranch: 55,
                    branching: {
                        branches: [{
                            frameIndex: 19,
                            weight: 40
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [0, 2604]
                    ],
                    exitBranch: 55
                }, {
                    duration: 100,
                    images: [
                        [3224, 2511]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2604]
                    ]
                }, {
                    duration: 1000,
                    images: [
                        [744, 2604]
                    ],
                    exitBranch: 54,
                    branching: {
                        branches: [{
                            frameIndex: 27,
                            weight: 65
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [868, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2604]
                    ]
                }, {
                    duration: 500,
                    images: [
                        [1364, 2604]
                    ],
                    exitBranch: 33,
                    branching: {
                        branches: [{
                            frameIndex: 32,
                            weight: 75
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1488, 2604]
                    ],
                    exitBranch: 34,
                    branching: {
                        branches: [{
                            frameIndex: 32,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [1364, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 2604]
                    ],
                    exitBranch: 55
                }, {
                    duration: 100,
                    images: [
                        [2108, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2604]
                    ],
                    exitBranch: 55,
                    branching: {
                        branches: [{
                            frameIndex: 19,
                            weight: 20
                        }, {
                            frameIndex: 40,
                            weight: 80
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2356, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 2604]
                    ],
                    exitBranch: 55,
                    branching: {
                        branches: [{
                            frameIndex: 48,
                            weight: 75
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [0, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 2604]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 2697]
                    ],
                    exitBranch: 55,
                    branching: {
                        branches: [{
                            frameIndex: 49,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [372, 2697]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 28,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [496, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            EmptyTrash: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [1116, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2697]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [1364, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2697]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [1860, 2697]
                    ],
                    sound: '3'
                }, {
                    duration: 100,
                    images: [
                        [1984, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 2697]
                    ],
                    exitBranch: 16
                }, {
                    duration: 100,
                    images: [
                        [2604, 2697]
                    ],
                    sound: '3'
                }, {
                    duration: 100,
                    images: [
                        [2728, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2697]
                    ],
                    exitBranch: 23
                }, {
                    duration: 100,
                    images: [
                        [3100, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3224, 2697]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 2790]
                    ],
                    sound: '3'
                }, {
                    duration: 100,
                    images: [
                        [124, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [372, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2790]
                    ],
                    exitBranch: 29
                }, {
                    duration: 100,
                    images: [
                        [620, 2790]
                    ],
                    sound: '3'
                }, {
                    duration: 100,
                    images: [
                        [744, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [992, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2790]
                    ],
                    exitBranch: 31,
                    sound: '3'
                }, {
                    duration: 100,
                    images: [
                        [1364, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 2790]
                    ]
                }, {
                    duration: 900
                }, {
                    duration: 100,
                    images: [
                        [992, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            Greeting: {
                frames: [{
                    duration: 100,
                    branching: {
                        branches: [{
                            frameIndex: 30,
                            weight: 40
                        }]
                    },
                    sound: '15'
                }, {
                    duration: 100,
                    images: [
                        [1612, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 2790]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [1860, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2604, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2852, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 2790]
                    ],
                    sound: '14'
                }, {
                    duration: 100,
                    images: [
                        [3224, 2790]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [124, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [248, 2883]
                    ]
                }, {
                    duration: 300,
                    images: [
                        [372, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [496, 2883]
                    ],
                    sound: '10'
                }, {
                    duration: 450,
                    images: [
                        [372, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [620, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [744, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [868, 2883]
                    ],
                    sound: '12'
                }, {
                    duration: 100,
                    images: [
                        [992, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 2883]
                    ],
                    sound: '4'
                }, {
                    duration: 100,
                    images: [
                        [1364, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 2883]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 38,
                            weight: 100
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [992, 1395]
                    ],
                    sound: '11'
                }, {
                    duration: 100,
                    images: [
                        [1116, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1364, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1488, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1612, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1736, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1860, 1395]
                    ],
                    exitBranch: 38
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            LookUp: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [1736, 2883]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [1860, 2883]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [1984, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 2883]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            GestureDown: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2480, 1395]
                    ],
                    exitBranch: 14
                }, {
                    duration: 100,
                    images: [
                        [2604, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2728, 1395]
                    ],
                    branching: {
                        branches: [{
                            frameIndex: 5,
                            weight: 50
                        }]
                    }
                }, {
                    duration: 100,
                    images: [
                        [2852, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2976, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [3100, 1395]
                    ],
                    exitBranch: 14
                }, {
                    duration: 100,
                    images: [
                        [3224, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 1488]
                    ]
                }, {
                    duration: 450,
                    images: [
                        [124, 1488]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2356, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2232, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [2108, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1984, 1395]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            RestPose: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            IdleEyeBrowRaise: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [1116, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 186]
                    ]
                }, {
                    duration: 900,
                    images: [
                        [1364, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 186]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            },
            LookDownLeft: {
                frames: [{
                    duration: 100,
                    images: [
                        [0, 0]
                    ],
                    exitBranch: 6
                }, {
                    duration: 100,
                    images: [
                        [744, 3069]
                    ],
                    exitBranch: 5
                }, {
                    duration: 100,
                    images: [
                        [868, 3069]
                    ],
                    exitBranch: 4
                }, {
                    duration: 1200,
                    images: [
                        [992, 3069]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1116, 3069]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [1240, 3069]
                    ]
                }, {
                    duration: 100,
                    images: [
                        [0, 0]
                    ]
                }]
            }
        }
    }).done(e => { agent = e; });

    // wrapper to the success callback
    const cb = function () {
        const a = new clippy.Agent(path, agent);
        successCb(a);
    };

    $.when(mapDfd).done(cb).fail(failCb);
};

clippy.load._maps = {};
clippy.load._loadMap = function (path) {
    let dfd = clippy.load._maps[path];
    if (dfd) return dfd;

    // set dfd if not defined
    clippy.load._maps[path] = $.Deferred();
    dfd = $.Deferred();

    const src = `${path}/map.png`;
    const img = new Image();

    img.onload = dfd.resolve;
    img.onerror = dfd.reject;

    // start loading the map;
    img.setAttribute('src', src);

    return dfd.promise();
};

clippy.load._sounds = {};

clippy.load._loadSounds = function (name, path) {
    let dfd = clippy.load._sounds[name];
    if (dfd) return dfd;

    // set dfd if not defined
    clippy.load._sounds[name] = $.Deferred();
    dfd = $.Deferred();

    const audio = document.createElement('audio');
    const canPlayMp3 = !!audio.canPlayType && audio.canPlayType('audio/mpeg') !== '';
    const canPlayOgg = !!audio.canPlayType && audio.canPlayType('audio/ogg; codecs="vorbis"') !== '';

    if (!canPlayMp3 && !canPlayOgg) {
        dfd.resolve({});
    } else {
        const src = path + (canPlayMp3 ? '/sounds-mp3.js' : '/sounds-ogg.js');
        // load
        clippy.load._loadScript(src);
    }

    return dfd.promise();
};


clippy.load._data = {};
clippy.load._loadAgent = function (name, path) {
    let dfd = clippy.load._data[name];
    if (dfd) return dfd;

    dfd = clippy.load._getAgentDfd(name);

    const src = `${path}/agent.js`;

    clippy.load._loadScript(src);

    return dfd.promise();
};

clippy.load._loadScript = function (src) {
    const script = document.createElement('script');
    script.setAttribute('src', src);
    script.setAttribute('async', 'async');
    script.setAttribute('type', 'text/javascript');

    document.head.appendChild(script);
};

clippy.load._getAgentDfd = function (name) {
    let dfd = clippy.load._data[name];
    if (!dfd) {
        clippy.load._data[name] = $.Deferred();
        dfd = $.Deferred();
    }
    return dfd;
};

clippy.ready = function (name, data) {
    const dfd = clippy.load._getAgentDfd(name);
    return dfd.resolve(data);
};

clippy.soundsReady = function (name, data) {
    let dfd = clippy.load._sounds[name];
    if (!dfd) {
        clippy.load._sounds[name] = $.Deferred();
        dfd = $.Deferred();
    }

    return dfd.resolve(data);
};

/** ****
 * Tiny Queue
 *
 * @constructor
 */
clippy.Queue = function (onEmptyCallback) {
    this._queue = [];
    this._onEmptyCallback = onEmptyCallback;
};

clippy.Queue.prototype = {
    /** *
     *
     * @param {function(Function)} func
     * @returns {jQuery.Deferred}
     */
    queue (func) {
        this._queue.push(func);

        if (this._queue.length === 1 && !this._active) {
            this._progressQueue();
        }
    },

    _progressQueue () {
        // stop if nothing left in queue
        if (!this._queue.length) {
            this._onEmptyCallback();
            return;
        }

        const f = this._queue.shift();
        this._active = true;

        // execute function
        const completeFunction = $.proxy(this.next, this);
        f(completeFunction);
    },

    clear () {
        this._queue = [];
    },

    next () {
        this._active = false;
        this._progressQueue();
    }
};
