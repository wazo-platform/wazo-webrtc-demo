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

If you have Docker installed on your computer, you can also run `docker-compose up --build` and tadaaaa it's all set!

or

It's possible to install this demo as a plugin:

    apt install wazo-plugin-cli
    wazo-plugind-cli -c 'install git https://github.com/wazo-platform/wazo-webrtc-demo'

Open your browser to https://server/wazo-webrtc-demo
