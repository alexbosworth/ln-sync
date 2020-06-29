const asyncEach = require('async/each');
const asyncRetry = require('async/retry');

const {syncChannelPolicy} = require('./../sync');
const {syncNode} = require('./../sync');

const interval = () => Math.round(Math.random() * 1e5);
const times = 1e3;

/** Policy was updated

  {
    db: <Database Object>
    emitter: <EventEmitter Object>
    id: <Channel Id String>
    lnd: <Authenticated LND API Object>
    public_keys: [<Updating Node Public Key Hex String>]
    synced_by: <Policy Synced By Public Key Hex String>
  }

  @returns via Promise
*/
module.exports = async (args) => {
  const {id} = args;
  const [key] = args.public_keys;

  return await asyncRetry({interval, times}, async () => {
    await asyncEach(args.public_keys, async node => {
      return await syncNode({db: args.db, id: node, lnd: args.lnd});
    });

    const synced = await syncChannelPolicy({
      id,
      db: args.db,
      lnd: args.lnd,
      public_key: key,
    });

    // Exit early when there are no updates
    if (!synced.updates) {
      return;
    }

    if (synced.updates.is_disabled === false) {
      args.emitter.emit('policy_enabled', {
        id,
        public_key: key,
        synced_by: args.synced_by,
      });
    }

    if (synced.updates.is_disabled === true) {
      args.emitter.emit('policy_disabled', {
        id,
        public_key: key,
        synced_by: args.synced_by,
      });
    }

    if (!!synced.updates.base_fee_mtokens) {
      args.emitter.emit('policy_base_fee_updated', {
        id,
        previous: synced.previous.base_fee_mtokens,
        public_key: key,
        synced_by: args.synced_by,
        updated: synced.updates.base_fee_mtokens,
      });
    }

    if (!!synced.updates.cltv_delta) {
      args.emitter.emit('policy_cltv_delta_updated', {
        id,
        previous: synced.previous.cltv_delta,
        public_key: key,
        synced_by: args.synced_by,
        updated: synced.updates.cltv_delta,
      });
    }

    if (synced.updates.fee_rate !== undefined) {
      args.emitter.emit('policy_fee_rate_updated', {
        id,
        previous: synced.previous.fee_rate,
        public_key: key,
        synced_by: args.synced_by,
        updated: synced.updates.fee_rate,
      });
    }

    if (!!synced.updates.max_htlc_mtokens) {
      args.emitter.emit('policy_max_htlc_mtokens_updated', {
        id,
        previous: synced.previous.max_htlc_mtokens,
        public_key: key,
        synced_by: args.synced_by,
        updated: synced.updates.max_htlc_mtokens,
      });
    }

    if (!!synced.updates.min_htlc_mtokens) {
      args.emitter.emit('policy_min_htlc_mtokens_updated', {
        id,
        previous: synced.previous.min_htlc_mtokens,
        public_key: key,
        synced_by: args.synced_by,
        updated: synced.updates.min_htlc_mtokens,
      });
    }

    if (!!synced.created) {
      args.emitter.emit('policy_added', synced.created);
    }

    return;
  });
};
