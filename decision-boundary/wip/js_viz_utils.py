"""Initialize a flask server and render a viz in an iframe"""

from absl import app, flags, logging
import haiku as hk
import jax
import jax.numpy as jnp
import numpy as np
import optax
import time
import functools
import json

import itertools
import random
from typing import Iterable, Iterator, NamedTuple, TypeVar, Any, MutableMapping, Tuple


import portpicker

from flask import Flask
from flask import request

import pandas as pd
import threading
import json
from io import BytesIO
import logging


def init_flask_server(hyper, transformed_forward, state, rng, inputs):
  """
  Pass in model config
  """
  # TODO(adampearce): Pass in model
  def get_results(inputs):
    return transformed_forward.apply(state.params, rng, np.asarray(inputs))

  def get_attn_weights(inputs):
    results = get_results(inputs)

    attn_weights = [
        d['attn_weights'] for d in results['all_layer_activations']
    ]  # L B H T T
    attn_weights = np.einsum('ijklm->jiklm', attn_weights)  # B L H T T

    return attn_weights

  def get_attn_logits(inputs):
    results = get_results(inputs)

    attn_logits = [
        d['attn_logits'] for d in results['all_layer_activations']
    ]  # L B H T T
    attn_logits = np.einsum('ijklm->jiklm', attn_logits)  # B L H T T

    return attn_logits

  logger = logging.getLogger('werkzeug')
  handler = logging.FileHandler('flask.log')
  logger.addHandler(handler)
  app.logger.setLevel(logging.DEBUG)

  class NpEncoder(json.JSONEncoder):

    def default(self, obj):
      if isinstance(obj, np.integer):
        return int(obj)
      if isinstance(obj, np.floating):
        return float(obj)
      if isinstance(obj, np.ndarray):
        return obj.tolist()

      if isinstance(obj, jnp.integer):
        return int(obj)
      if isinstance(obj, jnp.floating):
        return float(obj)
      if isinstance(obj, jnp.ndarray):
        return obj.tolist()

      return super(NpEncoder, self).default(obj)

  def np_to_bytes(np_array):
    f = BytesIO()
    np.lib.format.write_array(f, np_array)
    return f.getvalue()

  @app.route('/hyper.json', methods=['GET', 'POST'])
  def hyper_json():
    # return "{'hello': 'world'}"
    return json.dumps(hyper, cls=NpEncoder)

  @app.route('/results.json', methods=['GET', 'POST'])
  def results_json():
    return json.dumps(get_results(request.json), cls=NpEncoder)

  @app.route('/attn_weights.npy', methods=['GET', 'POST'])
  def attn_weights_npy():
    return np_to_bytes(get_attn_weights(request.json))

  @app.route('/attn_logits_npy.npy', methods=['GET', 'POST'])
  def attn_logits_npy():
    return np_to_bytes(get_attn_logits(request.json))

  @app.route('/results_spread.npy', methods=['GET', 'POST'])
  def get_results_spread_npy():
    # with open('get_results_spread_input.json', 'w') as f:
    #   f.write(json.dumps(request.json))
    return np_to_bytes(get_results_spread(request.json))

  # Log errors to file.
  @app.errorhandler(500)
  def internal_server_error(e):
    app.logger.error(str(e))

    etype, value, tb = sys.exc_info()
    f = open('flask2.log', 'a')
    f.write('\n\n\n' + str(traceback.print_exception(etype, value, tb)) + '\n')
    f.write('logging error?')
    f.close()

    return str(e), 500

  threading.Thread(
      target=app.run, kwargs={'host': '::', 'port': flask_port}
  ).start()

  return flask_port
