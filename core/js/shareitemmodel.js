/*
 * Copyright (c) 2015
 *
 * This file is licensed under the Affero General Public License version 3
 * or later.
 *
 * See the COPYING-README file.
 *
 */

(function() {
	if(!OC.Share) {
		OC.Share = {};
		OC.Share.Types = {};
	}

	/**
	 * @typedef {object} OC.Share.Types.LinkShareInfo
	 * @property {bool} isLinkShare
	 * @property {string} token
	 * @property {string|null} password
	 * @property {string} link
	 * @property {number} permissions
	 * @property {Date} expiration
	 * @property {number} stime share time
	 */

	/**
	 * @typedef {object} OC.Share.Types.Reshare
	 * @property {string} uid_owner
	 * @property {number} share_type
	 * @property {string} share_with
	 * @property {string} displayname_owner
	 * @property {number} permissions
	 */

	/**
	 * @typedef {object} OC.Share.Types.ShareInfo
	 * @property {number} share_type
	 * @property {number} permissions
	 * @property {number} file_source optional
	 * @property {number} item_source
	 * @property {string} token
	 * @property {string} share_with
	 * @property {string} share_with_displayname
	 * @property {string} mail_send
	 * @property {Date} expiration optional?
	 * @property {number} stime optional?
	 * @property {string} uid_owner
	 */

	/**
	 * @typedef {object} OC.Share.Types.ShareItemInfo
	 * @property {OC.Share.Types.Reshare} reshare
	 * @property {OC.Share.Types.ShareInfo[]} shares
	 * @property {OC.Share.Types.LinkShareInfo|undefined} linkShare
	 */

	/**
	 * These properties are sometimes returned by the server as strings instead
	 * of integers, so we need to convert them accordingly...
	 */
	var SHARE_RESPONSE_INT_PROPS = [
		'id', 'mail_send', 'permissions',
		'storage', 'share_type', 'parent', 'stime'
	];

	/**
	 * @class OCA.Share.ShareItemModel
	 * @classdesc
	 *
	 * Represents the GUI of the share dialogue
	 *
	 * // FIXME: use OC Share API once #17143 is done
	 *
	 * // TODO: this really should be a collection of share item models instead,
	 * where the link share is one of them
	 */
	var ShareItemModel = OC.Backbone.Model.extend({
		/**
		 * @type share id of the link share, if applicable
		 */
		_linkShareId: null,

		_linkSharesCollection: null,

		initialize: function(attributes, options) {
			if(!_.isUndefined(options.configModel)) {
				this.configModel = options.configModel;
			}
			if(!_.isUndefined(options.fileInfoModel)) {
				/** @type {OC.Files.FileInfo} **/
				this.fileInfoModel = options.fileInfoModel;
			}

			this._linkSharesCollection = new OC.Share.SharesCollection();

			_.bindAll(this, 'addShare');
		},

		defaults: {
			permissions: 0,
			linkShare: {}
		},

		/**
		 * Returns the collection of link shares
		 *
		 * @return {OC.Share.SharesCollection} shares collection
		 */
		getLinkSharesCollection: function() {
			return this._linkSharesCollection;
		},

		/**
		 * Returns the file info for the file/folder on which this share information relate to
		 *
		 * @return {OC.Files.FileInfoModel} file info model
		 */
		getFileInfo: function() {
			return this.fileInfoModel;
		},

		addShare: function(attributes, options) {
			var shareType = attributes.shareType;
			options = options || {};
			attributes = _.extend({}, attributes);

			var defaultPermissions = OC.getCapabilities()['files_sharing']['default_permissions'] || OC.PERMISSION_ALL;

			// Default permissions are Edit (CRUD) and Share
			// Check if these permissions are possible
			var possiblePermissions = OC.PERMISSION_READ;
			if (this.updatePermissionPossible()) {
				possiblePermissions = possiblePermissions | OC.PERMISSION_UPDATE;
			}
			if (this.createPermissionPossible()) {
				possiblePermissions = possiblePermissions | OC.PERMISSION_CREATE;
			}
			if (this.deletePermissionPossible()) {
				possiblePermissions = possiblePermissions | OC.PERMISSION_DELETE;
			}
			if (this.configModel.get('isResharingAllowed') && (this.sharePermissionPossible())) {
				possiblePermissions = possiblePermissions | OC.PERMISSION_SHARE;
			}

			attributes.permissions = defaultPermissions & possiblePermissions;
			if (_.isUndefined(attributes.path)) {
				attributes.path = this.fileInfoModel.getFullPath();
			}

			var self = this;
			return $.ajax({
				type: 'POST',
				url: this._getUrl('shares'),
				data: attributes,
				dataType: 'json'
			}).done(function() {
				self.fetch().done(function() {
					if (_.isFunction(options.success)) {
						options.success(self);
					}
				});
			}).fail(function(xhr) {
				var msg = t('core', 'Error');
				var result = xhr.responseJSON;
				if (result && result.ocs && result.ocs.meta) {
					msg = result.ocs.meta.message;
				}

				if (_.isFunction(options.error)) {
					options.error(self, msg);
				} else {
					OC.dialogs.alert(msg, t('core', 'Error while sharing'));
				}
			});
		},

		updateShare: function(shareId, attrs, options) {
			var self = this;
			options = options || {};
			return $.ajax({
				type: 'PUT',
				url: this._getUrl('shares/' + encodeURIComponent(shareId)),
				data: attrs,
				dataType: 'json'
			}).done(function() {
				self.fetch({
					success: function() {
						if (_.isFunction(options.success)) {
							options.success(self);
						}
					}
				});
			}).fail(function(xhr) {
				var msg = t('core', 'Error');
				var result = xhr.responseJSON;
				if (result.ocs && result.ocs.meta) {
					msg = result.ocs.meta.message;
				}

				if (_.isFunction(options.error)) {
					options.error(self, msg);
				} else {
					OC.dialogs.alert(msg, t('core', 'Error while sharing'));
				}
			});
		},

		/**
		 * Deletes the share with the given id
		 *
		 * @param {int} shareId share id
		 * @return {jQuery}
		 */
		removeShare: function(shareId, options) {
			var self = this;
			options = options || {};
			return $.ajax({
				type: 'DELETE',
				url: this._getUrl('shares/' + encodeURIComponent(shareId)),
			}).done(function() {
				self.fetch({
					success: function() {
						if (_.isFunction(options.success)) {
							options.success(self);
						}
					}
				});
			}).fail(function(xhr) {
				var msg = t('core', 'Error');
				var result = xhr.responseJSON;
				if (result.ocs && result.ocs.meta) {
					msg = result.ocs.meta.message;
				}

				if (_.isFunction(options.error)) {
					options.error(self, msg);
				} else {
					OC.dialogs.alert(msg, t('core', 'Error removing share'));
				}
			});
		},

		/**
		 * @returns {boolean}
		 */
		isFolder: function() {
			return this.get('itemType') === 'folder';
		},

		/**
		 * @returns {boolean}
		 */
		isFile: function() {
			return this.get('itemType') === 'file';
		},

		/**
		 * whether this item has reshare information
		 * @returns {boolean}
		 */
		hasReshare: function() {
			var reshare = this.get('reshare');
			return _.isObject(reshare) && !_.isUndefined(reshare.uid_owner);
		},

		/**
		 * whether this item has user share information
		 * @returns {boolean}
		 */
		hasUserShares: function() {
			return this.getSharesWithCurrentItem().length > 0;
		},

		/**
		 * Returns whether this item has a link share
		 *
		 * @return {bool} true if a link share exists, false otherwise
		 */
		hasLinkShare: function() {
			return this._linkSharesCollection.length > 0;
		},

		/**
		 * @returns {string}
		 */
		getFileOwner: function() {
			return this.get('reshare').uid_file_owner;
		},

		/**
		 * @returns {string}
		 */
		getFileOwnerDisplayname: function() {
			return this.get('reshare').displayname_file_owner;
		},

		/**
		 * @returns {string}
		 */
		getReshareOwner: function() {
			return this.get('reshare').uid_owner;
		},

		/**
		 * @returns {string}
		 */
		getReshareOwnerDisplayname: function() {
			return this.get('reshare').displayname_owner;
		},

		/**
		 * @returns {string}
		 */
		getReshareWith: function() {
			return this.get('reshare').share_with;
		},

		/**
		 * @returns {string}
		 */
		getReshareWithDisplayName: function() {
			var reshare = this.get('reshare');
			return reshare.share_with_displayname || reshare.share_with;
		},

		/**
		 * @returns {number}
		 */
		getReshareType: function() {
			return this.get('reshare').share_type;
		},

		/**
		 * Returns all share entries that only apply to the current item
		 * (file/folder)
		 *
		 * @return {Array.<OC.Share.Types.ShareInfo>}
		 */
		getSharesWithCurrentItem: function() {
			var shares = this.get('shares') || [];
			var fileId = this.fileInfoModel.get('id');
			return _.filter(shares, function(share) {
				return share.item_source === fileId;
			});
		},

		/**
		 * @param shareIndex
		 * @returns {string}
		 */
		getShareWith: function(shareIndex) {
			/** @type OC.Share.Types.ShareInfo **/
			var share = this.get('shares')[shareIndex];
			if(!_.isObject(share)) {
				throw "Unknown Share";
			}
			return share.share_with;
		},

		/**
		 * @param shareIndex
		 * @returns {string}
		 */
		getShareWithDisplayName: function(shareIndex) {
			/** @type OC.Share.Types.ShareInfo **/
			var share = this.get('shares')[shareIndex];
			if(!_.isObject(share)) {
				throw "Unknown Share";
			}
			return share.share_with_displayname;
		},

		/**
		 * @param shareIndex
		 * @returns {string}
		 */
		getShareWithAdditionalInfo: function(shareIndex) {
			/** @type OC.Share.Types.ShareInfo **/
			var share = this.get('shares')[shareIndex];
			if(!_.isObject(share)) {
				throw "Unknown Share";
			}
			return share.share_with_additional_info;
		},

		getShareType: function(shareIndex) {
			/** @type OC.Share.Types.ShareInfo **/
			var share = this.get('shares')[shareIndex];
			if(!_.isObject(share)) {
				throw "Unknown Share";
			}
			return share.share_type;
		},

		/**
		 * whether a share from shares has the requested permission
		 *
		 * @param {number} shareIndex
		 * @param {number} permission
		 * @returns {boolean}
		 * @private
		 */
		_shareHasPermission: function(shareIndex, permission) {
			/** @type OC.Share.Types.ShareInfo **/
			var share = this.get('shares')[shareIndex];
			if(!_.isObject(share)) {
				throw "Unknown Share";
			}
			return (share.permissions & permission) === permission;
		},

		notificationMailWasSent: function(shareIndex) {
			/** @type OC.Share.Types.ShareInfo **/
			var share = this.get('shares')[shareIndex];
			if(!_.isObject(share)) {
				throw "Unknown Share";
			}
			return share.mail_send === 1;
		},

		/**
		 * Sends an email notification for the given share
		 *
		 * @param {int} shareType share type
		 * @param {string} shareWith recipient
		 * @param {bool} state whether to set the notification flag or remove it
		 */
		sendNotificationForShare: function(shareType, shareWith, state) {
			var itemType = this.get('itemType');
			var itemSource = this.get('itemSource');

			return $.post(
				OC.generateUrl('core/ajax/share.php'),
				{
					action: state ? 'informRecipients' : 'informRecipientsDisabled',
					recipient: shareWith,
					shareType: shareType,
					itemSource: itemSource,
					itemType: itemType
				}
			);
		},

		/**
		 * @returns {boolean}
		 */
		sharePermissionPossible: function() {
			return (this.get('permissions') & OC.PERMISSION_SHARE) === OC.PERMISSION_SHARE;
		},

		/**
		 * @param {number} shareIndex
		 * @returns {boolean}
		 */
		hasSharePermission: function(shareIndex) {
			return this._shareHasPermission(shareIndex, OC.PERMISSION_SHARE);
		},

		/**
		 * @returns {boolean}
		 */
		createPermissionPossible: function() {
			return (this.get('permissions') & OC.PERMISSION_CREATE) === OC.PERMISSION_CREATE;
		},

		/**
		 * @param {number} shareIndex
		 * @returns {boolean}
		 */
		hasCreatePermission: function(shareIndex) {
			return this._shareHasPermission(shareIndex, OC.PERMISSION_CREATE);
		},

		/**
		 * @returns {boolean}
		 */
		updatePermissionPossible: function() {
			return (this.get('permissions') & OC.PERMISSION_UPDATE) === OC.PERMISSION_UPDATE;
		},

		/**
		 * @param {number} shareIndex
		 * @returns {boolean}
		 */
		hasUpdatePermission: function(shareIndex) {
			return this._shareHasPermission(shareIndex, OC.PERMISSION_UPDATE);
		},

		/**
		 * @returns {boolean}
		 */
		deletePermissionPossible: function() {
			return (this.get('permissions') & OC.PERMISSION_DELETE) === OC.PERMISSION_DELETE;
		},

		/**
		 * @param {number} shareIndex
		 * @returns {boolean}
		 */
		hasDeletePermission: function(shareIndex) {
			return this._shareHasPermission(shareIndex, OC.PERMISSION_DELETE);
		},

		/**
		 * @returns {boolean}
		 */
		editPermissionPossible: function() {
			return    this.createPermissionPossible()
				   || this.updatePermissionPossible()
				   || this.deletePermissionPossible();
		},

		/**
		 * @returns {boolean}
		 */
		hasEditPermission: function(shareIndex) {
			return    this.hasCreatePermission(shareIndex)
				   || this.hasUpdatePermission(shareIndex)
				   || this.hasDeletePermission(shareIndex);
		},

		_getUrl: function(base, params) {
			params = _.extend({format: 'json'}, params || {});
			return OC.linkToOCS('apps/files_sharing/api/v1', 2) + base + '?' + OC.buildQueryString(params);
		},

		_fetchShares: function() {
			var path = this.fileInfoModel.getFullPath();
			return $.ajax({
				type: 'GET',
				url: this._getUrl('shares', {path: path, reshares: true})
			});
		},

		_fetchReshare: function() {
			// only fetch original share once
			if (!this._reshareFetched) {
				var path = this.fileInfoModel.getFullPath();
				this._reshareFetched = true;
				return $.ajax({
					type: 'GET',
					url: this._getUrl('shares', {path: path, shared_with_me: true})
				});
			} else {
				return $.Deferred().resolve([{
					ocs: {
						data: [this.get('reshare')]
					}
				}]);
			}
		},

		/**
		 * Group reshares into a single super share element.
		 * Does this by finding the most precise share and
		 * combines the permissions to be the most permissive.
		 *
		 * @param {Array} reshares
		 * @return {Object} reshare
		 */
		_groupReshares: function(reshares) {
			if (!reshares || !reshares.length) {
				return false;
			}

			var superShare = reshares.shift();
			var combinedPermissions = superShare.permissions;
			_.each(reshares, function(reshare) {
				// use share have higher priority than group share
				if (reshare.share_type === OC.Share.SHARE_TYPE_USER && superShare.share_type === OC.Share.SHARE_TYPE_GROUP) {
					superShare = reshare;
				}
				combinedPermissions |= reshare.permissions;
			});

			superShare.permissions = combinedPermissions;
			return superShare;
		},

		fetch: function() {
			var model = this;
			this.trigger('request', this);

			var deferred = $.when(
				this._fetchShares(),
				this._fetchReshare()
			);
			deferred.done(function(data1, data2) {
				model.trigger('sync', 'GET', this);
				var sharesMap = {};
				_.each(data1[0].ocs.data, function(shareItem) {
					sharesMap[shareItem.id] = shareItem;
				});

				var reshare = false;
				if (data2[0].ocs.data.length) {
					reshare = model._groupReshares(data2[0].ocs.data);
				}

				model.set(model.parse({
					shares: sharesMap,
					reshare: reshare
				}));
			});

			return deferred;
		},

		/**
		 * Updates OC.Share.itemShares and OC.Share.statuses.
		 *
		 * This is required in case the user navigates away and comes back,
		 * the share statuses from the old arrays are still used to fill in the icons
		 * in the file list.
		 */
		_legacyFillCurrentShares: function(shares) {
			var fileId = this.fileInfoModel.get('id');
			if (!shares || !shares.length) {
				delete OC.Share.statuses[fileId];
				OC.Share.currentShares = {};
				OC.Share.itemShares = [];
				return;
			}

			var currentShareStatus = OC.Share.statuses[fileId];
			if (!currentShareStatus) {
				currentShareStatus = {link: false};
				OC.Share.statuses[fileId] = currentShareStatus;
			}
			currentShareStatus.link = false;

			OC.Share.currentShares = {};
			OC.Share.itemShares = [];
			_.each(shares,
				/**
				 * @param {OC.Share.Types.ShareInfo} share
				 */
				function(share) {
					if (share.share_type === OC.Share.SHARE_TYPE_LINK) {
						OC.Share.itemShares[share.share_type] = true;
						currentShareStatus.link = true;
					} else {
						if (!OC.Share.itemShares[share.share_type]) {
							OC.Share.itemShares[share.share_type] = [];
						}
						OC.Share.itemShares[share.share_type].push(share.share_with);
					}
				}
			);
		},

		parse: function(data) {
			if(data === false) {
				console.warn('no data was returned');
				this.trigger('fetchError');
				return {};
			}

			var permissions = this.get('possiblePermissions');
			if(!_.isUndefined(data.reshare) && !_.isUndefined(data.reshare.permissions) && data.reshare.uid_owner !== OC.currentUser) {
				permissions = permissions & data.reshare.permissions;
			}

			/** @type {OC.Share.Types.ShareInfo[]} **/
			var shares = _.map(data.shares, function(share) {
				// properly parse some values because sometimes the server
				// returns integers as string...
				var i;
				for (i = 0; i < SHARE_RESPONSE_INT_PROPS.length; i++) {
					var prop = SHARE_RESPONSE_INT_PROPS[i];
					if (!_.isUndefined(share[prop])) {
						share[prop] = parseInt(share[prop], 10);
					}
				}
				return share;
			});

			this._legacyFillCurrentShares(shares);

			var linkShares = [];
			// filter out the share by link
			shares = _.reject(shares,
				/**
				 * @param {OC.Share.Types.ShareInfo} share
				 */
				function(share) {
					var isShareLink =
						share.share_type === OC.Share.SHARE_TYPE_LINK
						&& (   share.file_source === this.get('itemSource')
						|| share.item_source === this.get('itemSource'));

					if (isShareLink) {
						/*
						 * Ignore reshared link shares for now
						 * FIXME: Find a way to display properly
						 */
						if (share.uid_owner !== OC.currentUser) {
							return share;
						}

						linkShares.push(share);
						return share;
					}
				},
				this
			);

			// populate link shares collection with found link shares
			this._linkSharesCollection.set(linkShares, {parse: true});

			// use the old crappy way for other shares for now
			return {
				reshare: data.reshare,
				shares: shares,
				permissions: permissions
			};
		},

		/**
		 * Parses a string to an valid integer (unix timestamp)
		 * @param time
		 * @returns {*}
		 * @internal Only used to work around a bug in the backend
		 */
		_parseTime: function(time) {
			if (_.isString(time)) {
				// skip empty strings and hex values
				if (time === '' || (time.length > 1 && time[0] === '0' && time[1] === 'x')) {
					return null;
				}
				time = parseInt(time, 10);
				if(isNaN(time)) {
					time = null;
				}
			}
			return time;
		},

		/**
		 * Returns a list of share types from the existing shares.
		 *
		 * @return {Array.<int>} array of share types
		 */
		getShareTypes: function() {
			var result;
			result = _.pluck(this.getSharesWithCurrentItem(), 'share_type');
			if (this.hasLinkShare()) {
				result.push(OC.Share.SHARE_TYPE_LINK);
			}
			return _.uniq(result);
		}
	});

	OC.Share.ShareItemModel = ShareItemModel;
})();
