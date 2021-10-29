# wazo-webrtc-demo
A simple demonstration of Wazo's WebRTC SDK

# Running

Open `index.html` with your favorite browser.

Or run on the current folder :

```sh
python -m SimpleHTTPServer
```

And open `localhost:8000` on your browser.

![Main screenshot](/screenshots/screen1.png?raw=true "Main")

Alternative installation
------------------------

It's possible to install this demo as a plugin:

    apt install wazo-plugind-cli
    wazo-plugind-cli -c 'install git https://github.com/wazo-platform/wazo-webrtc-demo'

Open your browser to https://server/wazo-webrtc-demo
